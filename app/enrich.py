"""Career stats that keep up between career uploads, plus what only WARMIND knows.

The baseline is the diver's latest career read (the game's own lifetime totals, from a
screenshot, stamped with its date). Every debrief recorded after that date adds its numbers on
top (kills, deaths, shots, accidentals, samples, stratagems, ... and one mission). A new career
read re-grounds everything: debriefs from before it are already inside the game's totals, so
they are marked as counted in that read (dated) and never added twice.

Numbers a scoreboard doesn't show (whether the mission was won, how long it ran, which kind of
stratagem was called) are added at the diver's own career rate, so a debrief never drags the
win rate, kills per minute or the stratagem mix around by itself.

`enriched` is what the game's career screen doesn't track at all: mission types, factions,
difficulties, modes, roles, planets, oaths kept or broken, medals. It is built from every
debrief, so a new career read never resets it.
"""

from __future__ import annotations

# debrief field -> career field
ADD = {"kills": "enemy_kills", "deaths": "deaths", "shots_fired": "shots_fired", "shots_hit": "shots_hit",
       "accidentals": "friendly_kills", "samples_extracted": "samples", "stratagems_used": "total_stratagems",
       "melee_kills": "melee_kills", "times_reinforcing": "reinforce_used", "objectives_completed": "objectives"}
SHARES = ("orbitals_used", "defensive_used", "eagle_used", "supply_used")
FACTION_KILLS = {"terminids": "terminid_kills", "automatons": "automaton_kills", "illuminate": "illuminate_kills"}


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def basis(locker_stats_rows: list) -> tuple[dict | None, float]:
    """(baseline snapshot, its time) from the locker's stat history: the latest career read."""
    reads = [r for r in locker_stats_rows or [] if r.get("snapshot")]
    if not reads:
        return None, 0.0
    last = max(reads, key=lambda r: r.get("at") or 0)
    return dict(last["snapshot"]), float(last.get("at") or 0)


def effective(baseline: dict | None, base_at: float, record: list) -> tuple[dict, dict]:
    """(career totals now, how they were made). `record`: the locker's results, each with
    `at`, `result` and `mission` ({faction, ...})."""
    snap = {k: v for k, v in (baseline or {}).items() if isinstance(v, (int, float))}
    played = float(snap.get("missions_played") or 0)
    win_rate = (float(snap.get("missions_won") or 0) / played) if played else None
    ext_rate = (float(snap.get("extractions") or 0) / played) if played and snap.get("extractions") is not None else None
    secs = (float(snap.get("in_mission_seconds") or 0) / played) if played and snap.get("in_mission_seconds") else None
    strat = float(snap.get("total_stratagems") or 0)
    shares = {k: float(snap.get(k) or 0) / strat for k in SHARES} if strat else {}
    added, dated = 0, 0
    for r in record:
        if base_at and (r.get("at") or 0) <= base_at:
            dated += 1   # already inside the game's totals at that career read
            continue
        res = r.get("result") or {}
        added += 1
        snap["missions_played"] = snap.get("missions_played", 0) + 1
        for src, dst in ADD.items():
            v = _num(res.get(src))
            # on a career read, only numbers it has (a partial read never grows a stat out of one drop)
            if v is not None and (not baseline or dst in snap):
                snap[dst] = snap.get(dst, 0) + v
        fk = FACTION_KILLS.get(((r.get("mission") or {}).get("faction") or ""))
        if fk and _num(res.get("kills")) is not None and (not baseline or fk in snap):
            snap[fk] = snap.get(fk, 0) + res["kills"]
        # what the scoreboard doesn't show: at the diver's own career rate
        if win_rate is not None:
            snap["missions_won"] = snap.get("missions_won", 0) + win_rate
        if ext_rate is not None:
            snap["extractions"] = snap.get("extractions", 0) + ext_rate
        if secs:
            snap["in_mission_seconds"] = snap.get("in_mission_seconds", 0) + secs
        su = _num(res.get("stratagems_used"))
        if su and shares:
            for k, sh in shares.items():
                if k in snap:
                    snap[k] = snap[k] + su * sh
    snap = {k: round(v) if isinstance(v, float) else v for k, v in snap.items()}
    how = {"career_at": base_at or None, "added": added, "dated": dated, "baseline": bool(baseline)}
    return snap, how


def enriched(record: list) -> dict:
    """What the career screen doesn't track, from every debrief."""
    def bump(d, k):
        if k:
            d[k] = d.get(k, 0) + 1
    out = {"missions": {}, "factions": {}, "difficulty": {}, "modes": {}, "roles": {}, "planets": {},
           "oaths": {"kept": 0, "broken": 0, "endorsed": 0}, "medals": 0, "drops": 0}
    for r in record:
        m = r.get("mission") or {}
        res = r.get("result") or {}
        out["drops"] += 1
        bump(out["missions"], m.get("name") or res.get("mission_name"))
        bump(out["factions"], m.get("faction"))
        bump(out["difficulty"], f"D{m['difficulty']}" if m.get("difficulty") else None)
        bump(out["modes"], m.get("mode"))
        bump(out["roles"], res.get("role"))
        bump(out["planets"], res.get("planet") or m.get("planet"))
        for v in r.get("verdicts") or []:
            if not v:
                continue
            if v.get("passed") is True:
                out["oaths"]["kept"] += 1
                out["oaths"]["endorsed"] += bool(v.get("endorsed_by"))
            elif v.get("passed") is False:
                out["oaths"]["broken"] += 1
            out["medals"] += bool(v.get("medal"))
    for k in ("missions", "factions", "difficulty", "modes", "roles", "planets"):
        out[k] = dict(sorted(out[k].items(), key=lambda kv: -kv[1]))
    return out
