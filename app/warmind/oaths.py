"""Oaths: an optional rule the squad swears before the drop.

The verdict is decided HERE, in code, from the numbers read off the scoreboard —
never by the model — so a medal can't be talked into existence. The model only
writes the citation or the dressing-down around a verdict it is handed. When a
number the oath needs isn't readable, the verdict is "unverified": no medal and
no judgement, rather than a guess either way.
"""

from __future__ import annotations

import hashlib
import json

OATHS = {
    "no_deaths":   {"name": "Unbroken",        "rule": "Zero deaths.",
                    "medal": "Order of the Unbroken"},
    "ghost":       {"name": "Ghost Protocol",  "rule": "Zero kills — objectives only.",
                    "medal": "Ghost of Super Earth"},
    "clean_hands": {"name": "Clean Hands",     "rule": "Zero accidentals and zero friendly-fire damage.",
                    "medal": "Clean Hands Citation"},
    "marksman":    {"name": "Marksman's Oath", "rule": "75%+ accuracy.",
                    "medal": "Marksman's Star"},
    "full_clear":  {"name": "Full Clear",      "rule": "Every objective on the map completed.",
                    "medal": "Liberator's Laurel"},
}
MARKSMAN_PCT = 75.0


def catalog() -> list[dict]:
    return [{"key": k, **v} for k, v in OATHS.items()]


def _num(r: dict, k: str):
    v = (r or {}).get(k)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def evaluate(oath: str | None, result: dict) -> dict | None:
    """Verdict for one diver's scoreboard: passed True / False / None (unverifiable)."""
    if not oath or oath not in OATHS:
        return None
    o = OATHS[oath]
    passed, reason = None, ""
    if oath == "no_deaths":
        d = _num(result, "deaths")
        if d is None:
            reason = "Deaths aren't readable on this scoreboard."
        else:
            passed, reason = d == 0, f"{int(d)} death{'' if d == 1 else 's'}."
    elif oath == "ghost":
        k = _num(result, "kills")
        if k is None:
            reason = "Kills aren't readable on this scoreboard."
        else:
            passed, reason = k == 0, f"{int(k)} kill{'' if k == 1 else 's'}."
    elif oath == "clean_hands":
        a, ff = _num(result, "accidentals"), _num(result, "friendly_fire_dmg")
        if a is None and ff is None:
            reason = "Accidentals and friendly fire aren't readable on this scoreboard."
        else:
            passed = (a or 0) == 0 and (ff or 0) == 0
            reason = f"{int(a or 0)} accidental{'' if (a or 0) == 1 else 's'}, {int(ff or 0)} friendly-fire damage."
    elif oath == "marksman":
        acc = _num(result, "accuracy_pct")
        if acc is None:
            sf, sh = _num(result, "shots_fired"), _num(result, "shots_hit")
            if sf:
                acc = (sh or 0) / sf * 100
        if acc is None:
            reason = "Accuracy isn't readable on this scoreboard."
        else:
            passed, reason = acc >= MARKSMAN_PCT, f"{acc:.1f}% accuracy (oath: {MARKSMAN_PCT:.0f}%+)."
    elif oath == "full_clear":
        c, t = _num(result, "objectives_completed"), _num(result, "objectives_total")
        if c is None or t is None:
            reason = ("Objective completion isn't on this screenshot — upload the mission "
                      "summary screen that lists objectives to verify.")
        else:
            passed, reason = (t > 0 and c >= t), f"{int(c)}/{int(t)} objectives."
    return {"oath": oath, "name": o["name"], "rule": o["rule"], "passed": passed, "reason": reason}


def medal(verdict: dict | None, *, lobby_id: str, player_id: str, result: dict, mode: str | None) -> dict | None:
    """A kept oath earns a medal with a deterministic ID: the same drop always yields
    the same ID, and different divers / drops / oaths yield different ones."""
    if not verdict or verdict.get("passed") is not True:
        return None
    o = OATHS[verdict["oath"]]
    seed = json.dumps([lobby_id, player_id, verdict["oath"], result, mode], sort_keys=True, default=str)
    h = hashlib.sha256(seed.encode()).hexdigest().upper()
    return {"id": f"WM-{h[:4]}-{h[4:8]}",
            "name": o["medal"] + (" — D100 Distinction" if mode == "d100" else "")}
