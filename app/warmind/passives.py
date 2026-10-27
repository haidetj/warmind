"""Armour passive x kit interactions (data/passives.yaml).

Armour is picked after the diver's weapons and stratagems are final, and each
armour candidate gets a small bonus when its passive rewards something the kit
actually carries — Inflammable with incendiary weapons, Gunslinger with a strong
sidearm, True Grit with a backpack-fed support weapon, and so on.
"""

from __future__ import annotations

import re
from functools import lru_cache

from . import loader


@lru_cache(maxsize=1)
def table() -> dict:
    return loader._load("passives.yaml")["passives"]


# kit_name families: arc and gas weapons don't all say so in their names
NAME_PATTERNS = {
    "arc": r"(^|[^a-z])arc([^a-z]|$)|tesla|blitzer|k-9",
    "gas": r"(^|[^a-z])gas([^a-z]|$)|tx-|sterilizer|dog breath",
}


def _hit(cond: str, kit: dict, faction: str) -> float:
    """How many times `cond` holds for this kit (0 if not)."""
    primary, secondary, grenade, strat = kit["primary"], kit["secondary"], kit["grenade"], kit["strat"]
    carried = [primary, secondary, grenade] + list(strat)
    kind, _, arg = cond.partition(":")
    if kind == "secondary_strong":
        return float("explosive_secondary" in secondary.tags or "heavy_pen" in secondary.tags
                     or secondary.grade.get(faction) in ("S", "A"))
    if kind == "secondary_any":
        return 1.0
    if kind == "primary_tag":
        return float(arg in primary.tags)
    if kind == "kit_tag":
        return float(any(arg in it.tags for it in carried))
    if kind == "kit_name":
        pat = NAME_PATTERNS.get(arg.lower(), re.escape(arg.lower()))
        return float(any(re.search(pat, it.name.lower()) for it in carried))
    if kind == "support":
        return float(any(s.category == "support" and not s.expendable for s in strat))
    if kind == "support_backpack":
        return float(any(s.category == "support" and s.backpack for s in strat))
    if kind == "grenade_cover":
        return float(arg in grenade.coverage)
    if kind == "strikes":
        return float(sum(1 for s in strat if s.category in ("eagle", "orbital")))
    if kind == "faction":
        return float(arg == faction)
    return 0.0


def bonus(passive: str, kit: dict, faction: str) -> tuple[float, list[str]]:
    """(score bonus, [reason keys]) for armour with `passive` on this kit. Each
    reason counts once — the strongest matching boost per reason."""
    best: dict[str, float] = {}
    for b in (table().get(passive) or {}).get("boosts", []):
        n = _hit(b["when"], kit, faction)
        if n:
            best[b["why"]] = max(best.get(b["why"], 0.0), b["w"] * n)
    return sum(best.values()), sorted(best, key=best.get, reverse=True)


def effect(passive: str) -> str:
    return (table().get(passive) or {}).get("effect", "")
