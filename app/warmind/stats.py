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


def scorecard(s: dict) -> list[dict]:
    """Human-facing derived stats for display. Each entry: {label, value, hint}.
    Only includes a stat when the inputs it needs are present, so we never show a
    fabricated 0. Career data has friendly-fire KILLS (not damage), labelled honestly."""
    g = lambda k: float(s.get(k) or 0)
    has = lambda *ks: any(s.get(k) for k in ks)
    out = []
    def add(label, value, hint=""):
        out.append({"label": label, "value": value, "hint": hint})

    if has("shots_fired"):
        add("Accuracy", f"{g('shots_hit') / (g('shots_fired') or 1) * 100:.1f}%", "shots hit / fired")
    if has("enemy_kills"):
        d = g("deaths")
        add("K/D", f"{g('enemy_kills') / d:.1f}" if d else "∞", "enemy kills / deaths")
    if has("missions_played"):
        m = g("missions_played")
        add("Mission success", f"{g('missions_won') / m * 100:.0f}%", "won / played")
        add("Extraction rate", f"{g('extractions') / m * 100:.0f}%", "extracted / played")
        add("Kills / mission", f"{g('enemy_kills') / m:.0f}")
        add("Deaths / mission", f"{g('deaths') / m:.1f}")
        if has("objectives"):
            add("Objectives / mission", f"{g('objectives') / m:.1f}")
        if has("samples"):
            add("Samples / mission", f"{g('samples') / m:.0f}")
        if has("total_stratagems"):
            add("Stratagems / mission", f"{g('total_stratagems') / m:.1f}")
        if has("in_mission_seconds"):
            add("Avg mission", f"{g('in_mission_seconds') / 60 / m:.0f} min")
    if has("enemy_kills") and has("friendly_kills"):
        ek = g("enemy_kills") or 1
        add("Friendly-fire kills", f"{g('friendly_kills') / ek * 1000:.1f}", "per 1k enemy kills")
    ek = g("enemy_kills") or 1
    if has("melee_kills"):
        add("Melee kill share", f"{g('melee_kills') / ek * 100:.1f}%")
    if has("grenade_kills"):
        add("Grenade kill share", f"{g('grenade_kills') / ek * 100:.1f}%")
    if has("eagle_kills"):
        add("Eagle kill share", f"{g('eagle_kills') / ek * 100:.1f}%")
    return out


# flavour fragments for the squad readout, keyed by a signal and its direction
def squad_readout(snaps: list[dict]) -> str | None:
    """A deterministic, flavourful one-line read of the whole squad from the
    aggregate of everyone's career stats. None when there's nothing to read."""
    snaps = [s for s in snaps if s]
    if not snaps:
        return None
    agg = {}
    for s in snaps:
        for k, v in s.items():
            if isinstance(v, (int, float)):
                agg[k] = agg.get(k, 0) + v
    g = lambda k: float(agg.get(k) or 0)
    clauses = []
    shots = g("shots_fired")
    if shots:
        acc = g("shots_hit") / shots * 100
        clauses.append((abs(acc - 65), "a crack shot squad" if acc >= 72 else
                        "spray-and-pray — trigger discipline is thin" if acc < 55 else
                        "steady marksmanship"))
    missions = g("missions_played")
    if missions:
        wr = g("missions_won") / missions * 100
        clauses.append((abs(wr - 85), "near-flawless mission record" if wr >= 92 else
                        "a shaky win record" if wr < 70 else "a solid win record"))
        xr = g("extractions") / missions * 100
        clauses.append((abs(xr - 70), "extraction-disciplined — they get out with the loot" if xr >= 80 else
                        "they'd rather die on the objective than extract" if xr < 50 else "even-handed about extraction"))
    ek = g("enemy_kills")
    if ek and g("friendly_kills") is not None:
        ffp = g("friendly_kills") / ek * 1000
        clauses.append((abs(ffp - 8), "surgically clean — almost no friendly fire" if ffp <= 3 else
                        "a danger to each other — heavy friendly fire" if ffp >= 15 else "normal friendly-fire discipline"))
    if ek and missions:
        kpm = ek / missions
        clauses.append((abs(kpm - 350) / 100, "an extermination crew" if kpm >= 500 else
                        "light on the trigger" if kpm < 180 else "a measured kill rate"))
    if not clauses:
        return None
    clauses.sort(key=lambda c: -c[0])  # strongest (most extreme) signals first
    picked = [c[1] for c in clauses[:3]]
    return "This squad reads as " + "; ".join(picked) + "."


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
