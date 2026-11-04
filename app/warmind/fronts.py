"""The front: how this faction's spawners die, and who in the squad can kill them.

Bug holes, fabricators and warp ships keep spawning until someone destroys them, and
only some gear can (data/fronts.yaml, from the wiki). This module:
  - nudges the grenade pick towards one that kills the faction's spawner (Frag / HE on
    bugs, Thermite on Illuminate warp ships, anything that fits a fabricator vent on bots)
    and away from one that can't (Arc, Stun, Smoke ...);
  - counts the squad's spawner killers (a closing grenade, or an explosive weapon that
    closes them from range) and who carries the anti-tank and the chaff clear, for the
    front brief and the squad review.
D100 drops the bonus for the easiest answers (no free one-shot Thermite on warp ships):
the squad still needs closers, it just has to put them through the door.
"""

from __future__ import annotations

from functools import lru_cache

from . import loader

VALUE = {"any": 0.8, "outside": 0.7, "yes": 0.5, "hard": 0.2, "no": -0.7}
STRUCT_TAGS = {"hole_closing", "structure_demo"}
CLOSES = {"yes", "hard", "outside", "any"}
PREFER_W = 0.5


@lru_cache(maxsize=1)
def _data() -> dict:
    return loader._load("fronts.yaml")


def front(faction: str) -> dict | None:
    return _data()["fronts"].get(faction)


def verdict(grenade_name: str, faction: str) -> str | None:
    f = front(faction)
    if not f:
        return None
    v = (_data()["throwables"].get(grenade_name) or {}).get(f["structure"])
    return {True: "yes", False: "no"}.get(v, v) if isinstance(v, bool) else v   # YAML reads yes/no as booleans


def grenade_term(item, faction: str, mode: str, mission_tags=()) -> float:
    v = verdict(item.name, faction)
    if v is None:
        return 0.0
    val = VALUE[v]
    if mode == "d100" and v in ("any", "outside"):
        val = VALUE["yes"]   # Helldive∞: no free answers
    if item.name in (front(faction) or {}).get("prefer", []) and v in CLOSES:
        val += PREFER_W      # the front's best kind of closer (splash on bugs, sticky on bots and squids)
    if STRUCT_TAGS & set(mission_tags or ()):
        val *= 1.5           # the mission is about killing spawners
    return val


def closes(kit: dict, faction: str) -> str | None:
    """How this diver kills the faction's spawner: 'grenade', 'weapon' (an explosive
    primary / secondary / support weapon), or None."""
    g = kit.get("grenade")
    if g is not None and verdict(g.name, faction) in CLOSES:
        return "grenade"
    for it in [kit.get("primary"), kit.get("secondary")] + [s for s in kit.get("strat", []) if s.category == "support"]:
        if it is not None and "st" in it.coverage:
            return "weapon"
    return None


def brief(faction: str, kits: list) -> dict | None:
    """kits: [{"callsign", "role", "primary", "secondary", "grenade", "strat": [...]}] (Items)."""
    f = front(faction)
    if not f:
        return None
    closers, at, ch = [], [], []
    for k in kits:
        how = closes(k, faction)
        if how:
            item = k["grenade"].name if how == "grenade" else next(
                it.name for it in [k["primary"], k["secondary"]] + [s for s in k["strat"] if s.category == "support"]
                if it is not None and "st" in it.coverage)
            closers.append({"callsign": k["callsign"], "item": item})
        carried = [k["primary"], k["secondary"], k["grenade"]] + list(k["strat"])
        if any("at" in it.coverage for it in carried if it is not None and it.slot != "grenade") or \
                any(s.category == "support" and "at" in s.coverage for s in k["strat"]):
            at.append(k["callsign"])
        if any("ch" in it.coverage for it in carried if it is not None):
            ch.append(k["callsign"])
    return {"faction": faction, "structure": f["structure"], "closers": closers, "at": at, "chaff": ch,
            "heavies": f.get("heavies", ""), "chaff_names": f.get("chaff", "")}
