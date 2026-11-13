"""Anthropic vision calls: read a career screenshot into stats, read a mission-select
screen into a mission config, and review a results screenshot as an after-action note.

At deploy this uses ANTHROPIC_API_KEY. With no key (or WARMIND_VISION_MOCK=1) it runs
in mock mode so the lobby flow works end-to-end without a key — mock cycles the real
seed snapshots so a local demo looks like real intake.
"""

from __future__ import annotations

import base64
import re
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
    "These are one or more screenshots of the same Helldivers 2 mission's end screens (a player "
    "scoreboard and/or the mission summary): read them together as one mission. Return ONE JSON object, no prose, with these fields where visible (omit any you "
    "cannot read): " + ", ".join(RESULT_FIELDS) + ". objectives_completed / objectives_total "
    "count main + optional objectives only if the screen lists them. Also mission_name (the mission "
    "title as shown, e.g. \"Eradicate Automaton Forces\") and planet if the screen names them. "
    "Return only the JSON object."
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


def _call(images, prompt: str, max_tokens: int = 1024, kind: str = "vision", with_stop: bool = False):
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
    import costs   # what this call cost, at list price (late import: costs imports db)
    costs.record(kind, data.get("model") or MODEL, data.get("usage"))
    text = "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")
    return (text, data.get("stop_reason")) if with_stop else text


_SENT_END = re.compile(r"[.!?。！？…](?:[\"'”’»)\]]*)")


def _whole_sentences(text: str) -> str:
    """Text cut off by the token limit, trimmed back to its last complete sentence."""
    ends = [m.end() for m in _SENT_END.finditer(text)]
    return text[:ends[-1]].rstrip() if ends and ends[-1] > len(text) * 0.4 else text.rstrip() + "…"


TUNE_PROMPT = (
    "A Helldivers 2 player is telling WARMIND, their squad's loadout coach, something after a mission. In their words:\n"
    "<<<{said}>>>\n"
    "What WARMIND knows about that drop (may be empty): {ctx}\n\n"
    "Write the ONE note WARMIND should keep so its next loadout suggestions for this player get better. Rules:\n"
    "- A standing instruction about gear, roles, squad jobs or play (what to give / avoid / lean into), not a summary or a thank-you.\n"
    "- Keep the player's own item and role names; be concrete; at most 25 words; written in {lang}.\n"
    "- Say whether it holds on every front (\"all\") or only against one faction (\"terminids\", \"automatons\", \"illuminate\").\n"
    "- If nothing in it helps future loadouts (chit-chat, a bug report, a complaint about the game), the note is null.\n"
    "Return only JSON: {{\"note\": <string or null>, \"applies\": \"all\" | \"terminids\" | \"automatons\" | \"illuminate\"}}"
)


def distill_tune(said: str, ctx: dict | None = None, lang: str = "en") -> dict:
    """What the player told WARMIND -> {"note", "applies"}: the one durable note that helps their next kits."""
    said = " ".join(str(said or "").split())[:800]
    if MOCK:
        fac = (ctx or {}).get("faction")
        return {"note": ("Mock note: " + said)[:160] if said else None, "applies": fac if fac in ("terminids", "automatons", "illuminate") else "all"}
    prompt = TUNE_PROMPT.format(said=said, ctx=json.dumps(ctx or {}, ensure_ascii=False)[:1500], lang=LANG_NAMES.get(lang, "English"))
    out = _extract_json(_call([], prompt, max_tokens=300, kind="tune"))
    note = out.get("note") if isinstance(out, dict) else None
    note = " ".join(str(note).split())[:240] if note else None
    ap = out.get("applies") if isinstance(out, dict) else None
    return {"note": note, "applies": ap if ap in ("terminids", "automatons", "illuminate") else "all"}


def split_lesson(text: str):
    """(review, lesson): the review's last line 'LESSON: …' is the kit lesson for next time."""
    m = re.search(r"(?im)^\s*\**\s*LESSON\s*\**\s*[:：]\s*(.+?)\s*$", text or "")
    if not m:
        return (text or "").strip(), None
    lesson = m.group(1).strip().strip("*").strip()
    review = (text[:m.start()] + text[m.end():]).strip()
    return review, (None if lesson.lower().rstrip(".") in ("none", "n/a", "-", "") else lesson[:240])


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
    return _extract_json(_call(images, CAREER_PROMPT, kind="career"))


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
    raw = _extract_json(_call([(image_bytes, media_type)], prompt, kind="mission"))
    return raw


# ---------------------------------------------------------------- after-action review
MOCK_RESULT = {"kills": 180, "accuracy_pct": 78.0, "deaths": 3, "accidentals": 0,
               "times_reinforcing": 2, "friendly_fire_dmg": 0}


def _imgs(image_bytes, media_type):
    """One screenshot (bytes + type) or several ([(bytes, type), ...]) -> a list, capped at 4."""
    if isinstance(image_bytes, list):
        return image_bytes[:4]
    return [(image_bytes, media_type)]


def read_result(image_bytes, media_type=None) -> dict:
    """Read the end-of-mission screen into numbers. The oath verdict is computed from
    these in code (warmind.oaths) before the review is written."""
    if MOCK:
        return dict(MOCK_RESULT)
    return _extract_json(_call(_imgs(image_bytes, media_type), RESULT_PROMPT, kind="result"))


SQUAD_PROMPT = (
    "These are one or more screenshots of the same Helldivers 2 mission's end screens; the scoreboard shows EVERY player in the squad "
    "(one column or row per player, each headed by the player's name). Return ONE JSON object, "
    "no prose: {\"players\": [{\"name\": <the player's name exactly as shown>, <fields>}]} with one entry "
    "per player in the order shown, and these fields where visible (omit any you cannot read): "
    + ", ".join(RESULT_FIELDS) + ". objectives_completed / objectives_total only if the screen lists "
    "them (they apply to every player). If the screen names the mission or planet, add top-level "
    "\"mission_name\" and \"planet\". {hint}Return only the JSON object."
)


def read_squad_results(image_bytes, media_type=None, expected: list | None = None) -> list:
    """Read a whole-squad scoreboard into one result per player: [{"name", ...fields}]."""
    expected = [e for e in (expected or []) if e]
    if MOCK:   # sample columns named after the squad, so matching can be exercised offline
        out = []
        for i, n in enumerate(expected or ["Diver 1", "Diver 2"]):
            r = dict(MOCK_RESULT, kills=MOCK_RESULT["kills"] - 37 * i, deaths=(MOCK_RESULT["deaths"] + i) % 4,
                     accuracy_pct=round(MOCK_RESULT["accuracy_pct"] - 6.5 * i, 1))
            out.append({"name": n.upper() if i % 2 else n, **r})
        return out
    hint = ("The squad's callsigns in WARMIND are: " + ", ".join(expected) + " (in-game names may differ). ") if expected else ""
    data = _extract_json(_call(_imgs(image_bytes, media_type), SQUAD_PROMPT.replace("{hint}", hint), kind="squad"))
    rows = data.get("players") if isinstance(data, dict) else data
    top = {k: data.get(k) for k in ("mission_name", "planet") if isinstance(data, dict) and data.get(k)}
    return [dict(top, **r) for r in (rows or []) if isinstance(r, dict) and r.get("name")][:8]


def _as_list(verdicts) -> list:
    return verdicts if isinstance(verdicts, list) else [verdicts] if verdicts else []


def _oath_brief(verdicts) -> str:
    return "".join(_oath_brief1(v) for v in _as_list(verdicts))


def _oath_brief1(verdict: dict | None) -> str:
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


def _mock_oath_line(verdicts) -> str:
    return "".join(_mock_oath_line1(v) for v in _as_list(verdicts))


def _mock_oath_line1(verdict: dict | None) -> str:
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
              "ko": "Korean", "zh": "Simplified Chinese", "hu": "Hungarian", "sv": "Swedish",
              "nl": "Dutch", "tl": "Tagalog (natural Filipino gamer Taglish is fine)",
              "sq": "Albanian", "bs": "Bosnian (Latin script)",
              "pirate": "English written in playful pirate speak (arr, matey, ye) — still clear and precise"}


def write_aar(image_bytes, media_type, result: dict, context: dict,
              verdict: dict | None = None, lang: str = "en") -> str:
    """Grade the ADVICE against the player's role and career baseline (stoic), with the
    oath verdict — already decided in code — woven in as citation or dressing-down.
    Written in the diver's chosen language; official item/stratagem names stay English."""
    if MOCK:
        return (_mock_oath_line(verdict) + "Mock review. Accuracy held above the career baseline and "
                "the discipline rule was kept (zero accidentals). The role's signature metric moved the right way."), \
            "Mock lesson: bring a backpack support weapon for the heavies."
    language = LANG_NAMES.get(lang, "English")
    prompt = (
        f"Write your entire reply in {language}. Keep official Helldivers 2 item, stratagem and "
        "role names exactly as given (in English).\n\n"
        "You are WARMIND, a Helldivers 2 squad coach. Grade the ADVICE you gave, not the player. "
        "Tone: stoic, state the finding then the evidence, never moralise about K/D or friendly fire. "
        "Report rates against the career baseline, not raw totals. Two or three sentences.\n\n"
        + _oath_brief(verdict)
        + (f"The screenshot shows the whole squad; this review is for the player in the column "
           f"\"{context['column']}\" only.\n" if context.get("column") else "") +
        f"Role assigned: {context.get('role')}\n"
        f"Play-style: {context.get('play_style')}\n"
        f"Mode: {context.get('mode')}\n"
        f"Kit: {json.dumps(context.get('kit', {}))}\n"
        f"Career baseline (rates): {json.dumps(context.get('baseline', {}))}\n"
        f"This mission's result: {json.dumps(result)}\n\n"
        "Did the role's signature metric move toward its target? Did the discipline rule hold? "
        "If the result was poor, check whether a thin capability with no deep partner caused it — "
        "that is a design error to own, not a player error.\n\n"
        + (f"Lessons WARMIND took from this diver's earlier debriefs: {json.dumps(context['lessons'])}. "
           "Say in a few words whether this mission bore them out.\n\n" if context.get("lessons") else "")
        + f"Then, on its own final line, write `LESSON: ` and one short sentence in {language}: the one change to "
        "this diver's KIT (an item, stratagem, armour or role to swap in or out) that WARMIND should carry into "
        "the next loadout, or `LESSON: none` if the kit worked. Return only the review and that line."
    )
    text, stop = _call(_imgs(image_bytes, media_type), prompt, max_tokens=1400, kind="review", with_stop=True)
    review, lesson = split_lesson(text)
    if stop == "max_tokens":   # never leave a review cut off mid-sentence
        review = _whole_sentences(review)
    return review.strip(), lesson


def status() -> dict:
    return {"mock": MOCK, "model": MODEL, "base_url": BASE_URL, "has_key": bool(API_KEY)}
