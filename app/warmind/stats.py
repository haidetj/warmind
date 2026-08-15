"""Derive metrics from a career snapshot and propose a play-style.

Career stats are cumulative, so per-mission and per-minute RATES are what
distinguish players, not raw totals. This computes those rates and offers a
heuristic play-style. The vision model also proposes one holistically; the
resolver takes the model's read when it is valid, and falls back to this.
Both are only a suggestion — the user can always override.
"""

from __future__ import annotations

ALLOWED = ("siege_anchor", "danger_close", "fire_for_effect", "forward_eye", "by_the_book")


def derive(s: dict) -> dict:
    """Snapshot -> derived rates. Tolerant of missing fields."""
    g = lambda k: float(s.get(k) or 0)
    strat = g("total_stratagems") or 1
    missions = g("missions_played") or 1
    minutes = (g("in_mission_seconds") or 0) / 60 or 1
    shots = g("shots_fired") or 1
    kills = g("enemy_kills")
    return {
        "def_share": g("defensive_used") / strat,
        "orb_share": g("orbitals_used") / strat,
        "eagle_share": g("eagle_used") / strat,
        "supply_share": g("supply_used") / strat,
        "accuracy": g("shots_hit") / shots,
        "kills_per_min": kills / minutes,
        "deaths_per_mission": g("deaths") / missions,
        "win_rate": g("missions_won") / missions,
        "eagle_kill_share": (g("eagle_kills") / kills) if kills else 0,
        "friendly_per_mission": g("friendly_kills") / missions,
    }


def validate(s: dict) -> list[str]:
    """The validity checks from the doctrine skill. Returns a list of problems."""
    problems = []
    fk = sum(float(s.get(k) or 0) for k in ("terminid_kills", "automaton_kills", "illuminate_kills"))
    ek = float(s.get("enemy_kills") or 0)
    if fk and ek and abs(fk - ek) / ek > 0.03:
        problems.append("faction kills do not sum to total enemy kills")
    cat = sum(float(s.get(k) or 0) for k in
              ("orbitals_used", "defensive_used", "eagle_used", "supply_used", "reinforce_used"))
    ts = float(s.get("total_stratagems") or 0)
    if ts and cat > ts * 1.03:
        problems.append("stratagem categories exceed total stratagems")
    return problems


def classify(s: dict) -> tuple[str, str]:
    """Heuristic play-style + one-line rationale. Find the share furthest from
    typical and build the read around it (the doctrine method, mechanised)."""
    m = derive(s)
    top_share = max(m["def_share"], m["orb_share"], m["eagle_share"])
    if m["win_rate"] >= 0.94 and m["deaths_per_mission"] <= 2.0 and top_share < 0.30:
        return "by_the_book", f"{m['win_rate']*100:.0f}% win rate with no dominant call type — a disciplined generalist."
    if m["def_share"] >= 0.30:
        return "siege_anchor", f"Defensive stratagems are {m['def_share']*100:.0f}% of calls — chooses ground and fortifies it."
    if m["orb_share"] >= 0.23 and m["orb_share"] >= m["eagle_share"]:
        return "fire_for_effect", f"Orbital-led at {m['orb_share']*100:.0f}% of calls, above eagles — a bombardment specialist."
    if m["eagle_share"] >= 0.19 or m["eagle_kill_share"] >= 0.14:
        return "danger_close", f"Ordnance-first — eagles are {m['eagle_share']*100:.0f}% of calls and {m['eagle_kill_share']*100:.0f}% of kills."
    if m["win_rate"] >= 0.90 and m["deaths_per_mission"] <= 2.2:
        return "by_the_book", f"{m['win_rate']*100:.0f}% win rate, {m['deaths_per_mission']:.2f} deaths/mission — disciplined generalist."
    return "by_the_book", "Balanced spread with no single dominant tendency."


def coerce_play_style(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower().replace(" ", "_").replace("-", "_")
    return v if v in ALLOWED else None
