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
    # `key` lets the client translate the label/hint; `value` is numbers only
    def add(key, label, value, hint=""):
        out.append({"key": key, "label": label, "value": value, "hint": hint})

    if has("shots_fired"):
        add("accuracy", "Accuracy", f"{g('shots_hit') / (g('shots_fired') or 1) * 100:.1f}%", "shots hit / fired")
    if has("enemy_kills"):
        d = g("deaths")
        add("kd", "K/D", f"{g('enemy_kills') / d:.1f}" if d else "∞", "enemy kills / deaths")
    if has("missions_played"):
        m = g("missions_played")
        add("success", "Mission success", f"{g('missions_won') / m * 100:.0f}%", "won / played")
        add("extraction", "Extraction rate", f"{g('extractions') / m * 100:.0f}%", "extracted / played")
        add("kills_pm", "Kills / mission", f"{g('enemy_kills') / m:.0f}")
        add("deaths_pm", "Deaths / mission", f"{g('deaths') / m:.1f}")
        if has("objectives"):
            add("objectives_pm", "Objectives / mission", f"{g('objectives') / m:.1f}")
        if has("samples"):
            add("samples_pm", "Samples / mission", f"{g('samples') / m:.0f}")
        if has("total_stratagems"):
            add("strats_pm", "Stratagems / mission", f"{g('total_stratagems') / m:.1f}")
        if has("in_mission_seconds"):
            add("avg_mission", "Avg mission (min)", f"{g('in_mission_seconds') / 60 / m:.0f}")
    if has("enemy_kills") and has("friendly_kills"):
        ek = g("enemy_kills") or 1
        add("ff_per_1k", "Friendly-fire kills", f"{g('friendly_kills') / ek * 1000:.1f}", "per 1k enemy kills")
    ek = g("enemy_kills") or 1
    if has("melee_kills"):
        add("melee_share", "Melee kill share", f"{g('melee_kills') / ek * 100:.1f}%")
    if has("grenade_kills"):
        add("grenade_share", "Grenade kill share", f"{g('grenade_kills') / ek * 100:.1f}%")
    if has("eagle_kills"):
        add("eagle_share", "Eagle kill share", f"{g('eagle_kills') / ek * 100:.1f}%")
    return out


# English text for each squad-readout clause key (the client translates by key)
READOUT_TEXT = {
    "acc_hi": "a crack shot squad", "acc_lo": "spray-and-pray — trigger discipline is thin",
    "acc_mid": "steady marksmanship",
    "wr_hi": "near-flawless mission record", "wr_lo": "a shaky win record", "wr_mid": "a solid win record",
    "xr_hi": "extraction-disciplined — they get out with the loot",
    "xr_lo": "they'd rather die on the objective than extract", "xr_mid": "even-handed about extraction",
    "ff_lo": "surgically clean — almost no friendly fire", "ff_hi": "a danger to each other — heavy friendly fire",
    "ff_mid": "normal friendly-fire discipline",
    "kpm_hi": "an extermination crew", "kpm_lo": "light on the trigger", "kpm_mid": "a measured kill rate",
}


def squad_readout(snaps: list[dict]) -> str | None:
    """A deterministic, flavourful one-line read of the whole squad from the
    aggregate of everyone's career stats. None when there's nothing to read."""
    keys = squad_readout_keys(snaps)
    if not keys:
        return None
    return "This squad reads as " + "; ".join(READOUT_TEXT[k] for k in keys) + "."


def squad_readout_keys(snaps: list[dict]) -> list[str]:
    """The (up to three) strongest readout clauses, as keys into READOUT_TEXT."""
    snaps = [s for s in snaps if s]
    if not snaps:
        return []
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
        clauses.append((abs(acc - 65), "acc_hi" if acc >= 72 else "acc_lo" if acc < 55 else "acc_mid"))
    missions = g("missions_played")
    if missions:
        wr = g("missions_won") / missions * 100
        clauses.append((abs(wr - 85), "wr_hi" if wr >= 92 else "wr_lo" if wr < 70 else "wr_mid"))
        xr = g("extractions") / missions * 100
        clauses.append((abs(xr - 70), "xr_hi" if xr >= 80 else "xr_lo" if xr < 50 else "xr_mid"))
    ek = g("enemy_kills")
    if ek and g("friendly_kills") is not None:
        ffp = g("friendly_kills") / ek * 1000
        clauses.append((abs(ffp - 8), "ff_lo" if ffp <= 3 else "ff_hi" if ffp >= 15 else "ff_mid"))
    if ek and missions:
        kpm = ek / missions
        clauses.append((abs(kpm - 350) / 100, "kpm_hi" if kpm >= 500 else "kpm_lo" if kpm < 180 else "kpm_mid"))
    clauses.sort(key=lambda c: -c[0])  # strongest (most extreme) signals first
    return [c[1] for c in clauses[:3]]


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


def classify_phrase(s: dict) -> dict:
    """The same read as classify(), as a translation key + params for the client."""
    m = derive(s)
    pct = lambda v: round(v * 100)
    top_share = max(m["def_share"], m["orb_share"], m["eagle_share"])
    if m["win_rate"] >= 0.94 and m["deaths_per_mission"] <= 2.0 and top_share < 0.30:
        return {"k": "style.generalist_win", "p": {"wr": pct(m["win_rate"])}}
    if m["def_share"] >= 0.30:
        return {"k": "style.siege", "p": {"pct": pct(m["def_share"])}}
    if m["orb_share"] >= 0.23 and m["orb_share"] >= m["eagle_share"]:
        return {"k": "style.orbital", "p": {"pct": pct(m["orb_share"])}}
    if m["eagle_share"] >= 0.19 or m["eagle_kill_share"] >= 0.14:
        return {"k": "style.ordnance", "p": {"calls": pct(m["eagle_share"]), "kills": pct(m["eagle_kill_share"])}}
    if m["win_rate"] >= 0.90 and m["deaths_per_mission"] <= 2.2:
        return {"k": "style.disciplined", "p": {"wr": pct(m["win_rate"]), "dpm": f"{m['deaths_per_mission']:.2f}"}}
    return {"k": "style.balanced", "p": {}}


def coerce_play_style(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower().replace(" ", "_").replace("-", "_")
    return v if v in ALLOWED else None
