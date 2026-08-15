"""Item model and the item pool.

An Item carries coverage axes (baseline capability), kit tags (the vocabulary the
pressure vector scores against), a provisional per-faction meta grade, and slot
metadata. Grades are a small prior; the pressure sum is what actually shapes a kit.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import loader

# Provisional grade -> scalar. Deliberately compressed so base_grade is a gentle
# tiebreak next to the pressure sum (which ranges roughly -2..+2). Replaced wholesale
# once the u.gg parser lands two-source-verified grades.
GRADE_SCALE = {"S": 1.0, "A": 0.6, "B": 0.2, "C": -0.2, "D": -0.6}

COVERAGE_AXES = ("at", "st", "ch", "bc")  # heavy / structure / chaff / break-contact


@dataclass(frozen=True)
class Item:
    name: str
    slot: str                       # primary | secondary | grenade | stratagem | armor
    category: str = ""              # stratagem sub-slot: support/backpack/eagle/orbital/sentry/emplacement/mine/relay
    coverage: frozenset = frozenset()
    tags: frozenset = frozenset()
    backpack: bool = False
    grade: dict = field(default_factory=dict, hash=False, compare=False)
    weight: str = ""                # armor only
    passive: str = ""               # armor only

    def base_grade(self, faction: str) -> float:
        return GRADE_SCALE.get(self.grade.get(faction, "C"), -0.2)


def _mk(rec: dict, slot: str) -> Item:
    return Item(
        name=rec["name"],
        slot=slot,
        category=rec.get("category", ""),
        coverage=frozenset(rec.get("coverage", [])),
        tags=frozenset(rec.get("tags", [])),
        backpack=bool(rec.get("backpack", False)),
        grade=rec.get("grade", {}),
        weight=rec.get("weight", ""),
        passive=rec.get("passive", ""),
    )


class Pool:
    """The full equipment pool, indexed by slot and category."""

    def __init__(self) -> None:
        raw = loader.items()
        self.primaries = [_mk(r, "primary") for r in raw["primaries"]]
        self.secondaries = [_mk(r, "secondary") for r in raw["secondaries"]]
        self.grenades = [_mk(r, "grenade") for r in raw["grenades"]]
        self.stratagems = [_mk(r, "stratagem") for r in raw["stratagems"]]
        self.armor = [_mk(r, "armor") for r in raw["armor"]]
        self.boosters = raw["boosters"]
        self._by_name = {i.name: i for i in self.all_items()}

    def all_items(self):
        return (self.primaries + self.secondaries + self.grenades
                + self.stratagems + self.armor)

    def get(self, name: str) -> Item | None:
        return self._by_name.get(name)

    def stratagems_in(self, categories: set[str]) -> list[Item]:
        return [s for s in self.stratagems if s.category in categories]

    def armor_of_weight(self, weight: str) -> list[Item]:
        return [a for a in self.armor if a.weight == weight]
