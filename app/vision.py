"""Anthropic vision calls: read a career screenshot into stats, read a mission-select
screen into a mission config, and review a results screenshot as an after-action note.

At deploy this uses ANTHROPIC_API_KEY. With no key (or WARMIND_VISION_MOCK=1) it runs
in mock mode so the lobby flow works end-to-end without a key — mock cycles the real
seed snapshots so a local demo looks like real intake.
"""

from __future__ import annotations

import base64
import json
import os
import pathlib

import httpx

from warmind import stats

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
                 "times_reinforcing", "friendly_fire_dmg", "distance_km"]

RESULT_PROMPT = (
    "This is a Helldivers 2 end-of-mission scoreboard for one player. Return ONE JSON object, "
    "no prose, with these fields where visible (omit any you cannot read): " + ", ".join(RESULT_FIELDS) +
    ". Return only the JSON object."
)


def _b64(image_bytes: bytes) -> str:
    return base64.standard_b64encode(image_bytes).decode()


def _call(images, prompt: str, max_tokens: int = 1024) -> str:
    """One vision message over one or more images. `images` is a list of
    (bytes, media_type). Returns the model's text. Raises on transport/HTTP error."""
    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    content = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": _b64(b)}}
               for (b, mt) in images]
    content.append({"type": "text", "text": prompt})
    body = {"model": MODEL, "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}]}
    with httpx.Client(timeout=90) as client:
        r = client.post(f"{BASE_URL}/v1/messages", headers=headers, json=body)
        r.raise_for_status()
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
def parse_career(images, mock_index: int = 0) -> dict:
    """images: list of (bytes, media_type) — one or more shots of the scrolling career screen."""
    if MOCK:
        snap = dict(_SEED_SNAPS[mock_index % len(_SEED_SNAPS)])
        raw = {k: snap.get(k) for k in CAREER_FIELDS if k in snap}
    else:
        raw = _extract_json(_call(images, CAREER_PROMPT))
    snapshot = {k: int(raw[k]) for k in CAREER_FIELDS if isinstance(raw.get(k), (int, float))}
    problems = stats.validate(snapshot)
    play_style, note = stats.classify(snapshot)
    return {
        "snapshot": snapshot,
        "callsign": raw.get("callsign") or None,
        "play_style": play_style,
        "style_note": note,
        "validity": problems,
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
def review_results(image_bytes: bytes, media_type: str, context: dict) -> dict:
    """Read a results scoreboard, then grade the ADVICE against the player's role and
    career baseline. Stoic. Grades the coach's call, never the player."""
    if MOCK:
        result = {"kills": 180, "accuracy_pct": 78.0, "deaths": 3, "accidentals": 0,
                  "times_reinforcing": 2, "friendly_fire_dmg": 0}
        aar = ("Mock review. Accuracy held above the career baseline and the discipline rule was "
               "kept (zero accidentals). The role's signature metric moved the right way.")
        return {"result": result, "aar_text": aar}
    result = _extract_json(_call([(image_bytes, media_type)], RESULT_PROMPT))
    prompt = (
        "You are WARMIND, a Helldivers 2 squad coach. Grade the ADVICE you gave, not the player. "
        "Tone: stoic, state the finding then the evidence, never moralise about K/D or friendly fire. "
        "Report rates against the career baseline, not raw totals. Two or three sentences.\n\n"
        f"Role assigned: {context.get('role')}\n"
        f"Play-style: {context.get('play_style')}\n"
        f"Kit: {json.dumps(context.get('kit', {}))}\n"
        f"Career baseline (rates): {json.dumps(context.get('baseline', {}))}\n"
        f"This mission's result: {json.dumps(result)}\n\n"
        "Did the role's signature metric move toward its target? Did the discipline rule hold? "
        "If the result was poor, check whether a thin capability with no deep partner caused it — "
        "that is a design error to own, not a player error. Return only the review text."
    )
    aar = _call([(image_bytes, media_type)], prompt, max_tokens=400).strip()
    return {"result": result, "aar_text": aar}


def status() -> dict:
    return {"mock": MOCK, "model": MODEL, "base_url": BASE_URL, "has_key": bool(API_KEY)}
