"""Anthropic vision calls: read a career screenshot into stats, read a mission-select
screen into a mission config, and review a results screenshot as an after-action note.

At deploy this uses ANTHROPIC_API_KEY. With no key (or WARMIND_VISION_MOCK=1) it runs
in mock mode so the lobby flow works end-to-end without a key — mock cycles the real
seed snapshots so a local demo looks like real intake.
"""

from __future__ import annotations

import base64
import io
import json
import os
import pathlib
from concurrent.futures import ThreadPoolExecutor

import httpx

from warmind import stats

try:
    from PIL import Image
    _HAVE_PIL = True
except Exception:  # Pillow missing — fall back to sending originals untouched
    _HAVE_PIL = False

# Anthropic resizes anything whose long edge is over ~1568px; sending bigger just
# wastes bytes and risks the request-size / dimension limits (a real problem with
# multiple 4K game screenshots). We downscale + re-encode to JPEG ourselves, which
# also normalises the media type so a mislabeled upload can't be rejected.
MAX_EDGE = 1568

MODEL = os.environ.get("WARMIND_MODEL", "claude-sonnet-5")
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
MOCK = os.environ.get("WARMIND_VISION_MOCK") == "1" or not API_KEY

_SEED = json.loads((pathlib.Path(__file__).parent / "warmind" / "squad_seed.json").read_text())
_SEED_SNAPS = _SEED["player_snapshots"]

CAREER_FIELDS = [
    "enemy_kills", "terminid_kills", "automaton_kills", "illuminate_kills", "friendly_kills",
    "grenade_kills", "melee_kills", "eagle_kills", "deaths", "shots_fired", "shots_hit",
    "orbitals_used", "defensive_used", "eagle_used", "supply_used", "reinforce_used",
    "total_stratagems", "missions_played", "missions_won", "extractions", "objectives",
    "samples", "in_mission_seconds",
]

CAREER_PROMPT = (
    "These are one or more screenshots of the SAME Helldivers 2 career stats screen — it "
    "scrolls, so a value may appear in only one image. Read every visible number across ALL "
    "images and merge them into ONE result. Return ONE JSON object, no prose, with these integer "
    "fields where visible (omit any you cannot read in any image): "
    + ", ".join(CAREER_FIELDS) +
    ". Also include \"callsign\" if a player name is visible. Stats are cumulative career totals. "
    "If the same field appears in more than one image, use the clearest reading. If a value is "
    "not shown anywhere, omit the key rather than guessing. Return only the JSON object."
)

RESULT_FIELDS = ["kills", "accuracy_pct", "shots_fired", "shots_hit", "deaths", "stims_used",
                 "accidentals", "samples_extracted", "stratagems_used", "melee_kills",
                 "times_reinforcing", "friendly_fire_dmg", "distance_km",
                 "objectives_completed", "objectives_total"]

RESULT_PROMPT = (
    "This is a Helldivers 2 end-of-mission screen (a player scoreboard and/or the mission "
    "summary). Return ONE JSON object, no prose, with these fields where visible (omit any you "
    "cannot read): " + ", ".join(RESULT_FIELDS) + ". objectives_completed / objectives_total "
    "count main + optional objectives only if the screen lists them. Return only the JSON object."
)


def _b64(image_bytes: bytes) -> str:
    return base64.standard_b64encode(image_bytes).decode()


def _normalize(images):
    """Downscale each image so its long edge is <= MAX_EDGE and re-encode to JPEG.
    Returns a list of (bytes, "image/jpeg"). If Pillow is unavailable or an image
    can't be decoded, that image is passed through unchanged."""
    if not _HAVE_PIL:
        return images
    out = []
    for (b, mt) in images:
        try:
            im = Image.open(io.BytesIO(b))
            if im.format == "JPEG" and max(im.size) <= MAX_EDGE:
                out.append((b, "image/jpeg"))  # already small enough: don't re-encode
                continue
            im.draft("RGB", (MAX_EDGE, MAX_EDGE))  # JPEG: decode at reduced size, less memory
            im.load()
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            w, h = im.size
            scale = MAX_EDGE / max(w, h)
            if scale < 1:
                im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=85)
            out.append((buf.getvalue(), "image/jpeg"))
        except Exception:
            out.append((b, mt))  # unreadable by Pillow — let the API try the original
    return out


def _call(images, prompt: str, max_tokens: int = 1024) -> str:
    """One vision message over one or more images. `images` is a list of
    (bytes, media_type). Returns the model's text. Raises on transport/HTTP error."""
    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    images = _normalize(images)
    content = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": _b64(b)}}
               for (b, mt) in images]
    content.append({"type": "text", "text": prompt})
    body = {"model": MODEL, "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}]}
    with httpx.Client(timeout=90) as client:
        r = client.post(f"{BASE_URL}/v1/messages", headers=headers, json=body)
        if r.status_code >= 400:
            # Surface the API's own message so failures are diagnosable, not opaque.
            raise RuntimeError(f"vision API {r.status_code}: {r.text[:300]}")
        data = r.json()
    return "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    a, b = text.find("{"), text.rfind("}")
    if a >= 0 and b > a:
        text = text[a:b + 1]
    return json.loads(text)


# ---------------------------------------------------------------- career intake
def _read_once(images) -> dict:
    return _extract_json(_call(images, CAREER_PROMPT))


def _reconcile(a: dict, b: dict):
    """Merge two independent reads of the same screenshots. A field both reads agree
    on is 'verified'; a field they disagree on (or only one read saw) is 'uncertain'
    and we keep the first read's value. Returns (snapshot, verified, uncertain, callsign)."""
    snapshot, verified, uncertain = {}, [], []
    for k in CAREER_FIELDS:
        va = a.get(k) if isinstance(a.get(k), (int, float)) else None
        vb = b.get(k) if isinstance(b.get(k), (int, float)) else None
        if va is None and vb is None:
            continue
        if va is not None and vb is not None and int(va) == int(vb):
            snapshot[k] = int(va); verified.append(k)
        else:
            snapshot[k] = int(va if va is not None else vb); uncertain.append(k)
    callsign = a.get("callsign") or b.get("callsign") or None
    return snapshot, verified, uncertain, callsign


def parse_career(images, mock_index: int = 0) -> dict:
    """images: list of (bytes, media_type) — one or more shots of the scrolling career
    screen. Read TWICE (in parallel) and reconcile, so agreeing fields are verified and
    disagreements are flagged — screenshot OCR is error-prone and this catches misreads."""
    if MOCK:
        snap = dict(_SEED_SNAPS[mock_index % len(_SEED_SNAPS)])
        raw = {k: snap.get(k) for k in CAREER_FIELDS if k in snap}
        snapshot = {k: int(raw[k]) for k in CAREER_FIELDS if isinstance(raw.get(k), (int, float))}
        verified, uncertain, callsign = list(snapshot.keys()), [], raw.get("callsign") or None
    else:
        # The second read is a cross-check, not a dependency: if one read fails
        # (rate limit, timeout, unparseable reply) we keep the other with every field
        # marked unverified. Only when BOTH fail does the read fail.
        reads, errors = [], []
        images = _normalize(images)  # once, not once per read
        with ThreadPoolExecutor(max_workers=2) as ex:
            for f in (ex.submit(_read_once, images), ex.submit(_read_once, images)):
                try:
                    reads.append(f.result())
                except Exception as e:  # noqa: BLE001 — any single-read failure is survivable
                    errors.append(e)
        if not reads:
            raise errors[0]
        snapshot, verified, uncertain, callsign = _reconcile(reads[0], reads[1] if len(reads) > 1 else {})
    problems = stats.validate(snapshot)
    play_style, note = stats.classify(snapshot)
    return {
        "snapshot": snapshot,
        "callsign": callsign,
        "play_style": play_style,
        "style_note": note,
        "validity": problems,
        "confidence": {"verified": verified, "uncertain": uncertain},
    }


# ---------------------------------------------------------------- mission prefill
def parse_mission(image_bytes: bytes, media_type: str, mission_ids: list[str]) -> dict:
    """Read a mission-select / map screenshot into a partial mission config for the
    creator to confirm. Constrained to the known mission id list."""
    if MOCK:
        return {"faction": "automatons", "difficulty": 7, "mission_guess": None,
                "note": "mock mode — fill the form manually"}
    prompt = (
        "This is a Helldivers 2 mission/operation select or galaxy map screen. Return ONE JSON "
        "object, no prose, with any of: \"faction\" (one of terminids, automatons, illuminate), "
        "\"difficulty\" (integer 1-10), \"planet_name\" (string), \"is_city_map\" (boolean), "
        "\"operation_modifiers\" (array of strings you can read, e.g. 'complex stratagem plotting', "
        "'poor intel'). Omit anything not clearly visible. Return only the JSON object."
    )
    raw = _extract_json(_call([(image_bytes, media_type)], prompt))
    return raw


# ---------------------------------------------------------------- after-action review
MOCK_RESULT = {"kills": 180, "accuracy_pct": 78.0, "deaths": 3, "accidentals": 0,
               "times_reinforcing": 2, "friendly_fire_dmg": 0}


def read_result(image_bytes: bytes, media_type: str) -> dict:
    """Read the end-of-mission screen into numbers. The oath verdict is computed from
    these in code (warmind.oaths) before the review is written."""
    if MOCK:
        return dict(MOCK_RESULT)
    return _extract_json(_call([(image_bytes, media_type)], RESULT_PROMPT))


def _oath_brief(verdict: dict | None) -> str:
    if not verdict:
        return ""
    head = f"The squad swore the oath \"{verdict['name']}\" ({verdict['rule']}). "
    if verdict.get("passed") is True:
        return (head + f"This diver KEPT it ({verdict['reason']}) and earns the medal "
                f"\"{(verdict.get('medal') or {}).get('name', '')}\". Open with one line in the voice of "
                "a medal citation, then the review.\n")
    if verdict.get("passed") is False:
        return (head + f"This diver BROKE it ({verdict['reason']}). Open with a cutting, in-character "
                "dressing-down for breaking the oath: dry, stoic contempt aimed at the performance and "
                "the numbers. Harsh but never abusive — no profanity, no slurs, nothing about the "
                "person's identity, intelligence or worth. Mock the play, not the player. Then the review.\n")
    return head + f"It could not be verified from this screenshot ({verdict['reason']}). Say so in one line — no medal, no judgement.\n"


def _mock_oath_line(verdict: dict | None) -> str:
    if not verdict:
        return ""
    if verdict.get("passed") is True:
        return f"Oath kept — {verdict['name']}. {verdict['reason']} Citation entered into the record. "
    if verdict.get("passed") is False:
        return (f"Oath broken — {verdict['name']}. {verdict['reason']} Super Earth notes both your "
                "enthusiasm and your result, and finds only one of them adequate. ")
    return f"Oath unverified — {verdict['reason']} "


LANG_NAMES = {"en": "English", "es": "Spanish", "pt": "Brazilian Portuguese", "fr": "French",
              "de": "German", "it": "Italian", "pl": "Polish", "ru": "Russian", "ja": "Japanese",
              "ko": "Korean", "zh": "Simplified Chinese"}


def write_aar(image_bytes: bytes, media_type: str, result: dict, context: dict,
              verdict: dict | None = None, lang: str = "en") -> str:
    """Grade the ADVICE against the player's role and career baseline (stoic), with the
    oath verdict — already decided in code — woven in as citation or dressing-down.
    Written in the diver's chosen language; official item/stratagem names stay English."""
    if MOCK:
        return (_mock_oath_line(verdict) + "Mock review. Accuracy held above the career baseline and "
                "the discipline rule was kept (zero accidentals). The role's signature metric moved the right way.")
    language = LANG_NAMES.get(lang, "English")
    prompt = (
        f"Write your entire reply in {language}. Keep official Helldivers 2 item, stratagem and "
        "role names exactly as given (in English).\n\n"
        "You are WARMIND, a Helldivers 2 squad coach. Grade the ADVICE you gave, not the player. "
        "Tone: stoic, state the finding then the evidence, never moralise about K/D or friendly fire. "
        "Report rates against the career baseline, not raw totals. Two or three sentences.\n\n"
        + _oath_brief(verdict) +
        f"Role assigned: {context.get('role')}\n"
        f"Play-style: {context.get('play_style')}\n"
        f"Mode: {context.get('mode')}\n"
        f"Kit: {json.dumps(context.get('kit', {}))}\n"
        f"Career baseline (rates): {json.dumps(context.get('baseline', {}))}\n"
        f"This mission's result: {json.dumps(result)}\n\n"
        "Did the role's signature metric move toward its target? Did the discipline rule hold? "
        "If the result was poor, check whether a thin capability with no deep partner caused it — "
        "that is a design error to own, not a player error. Return only the review text."
    )
    return _call([(image_bytes, media_type)], prompt, max_tokens=500).strip()


def status() -> dict:
    return {"mock": MOCK, "model": MODEL, "base_url": BASE_URL, "has_key": bool(API_KEY)}
