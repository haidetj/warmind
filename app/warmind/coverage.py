"""Baseline capability enforcement.

Every diver leaves with an answer to heavy armour (at) and a way to kill a
structure (st) — hard requirements, as in the doctrine. Chaff (ch) and break-
contact (bc) may be thin on a diver *if* a named teammate is deep there. A thin
axis with no deep partner is a design error, not specialisation.
"""

from __future__ import annotations

from .items import COVERAGE_AXES

AXIS_LABEL = {"at": "heavy armour", "st": "structures", "ch": "chaff", "bc": "break contact"}
HARD_AXES = ("at", "st")


def kit_coverage(kit_items) -> set[str]:
    covered: set[str] = set()
    for it in kit_items:
        covered |= set(it.coverage)
    return covered


def thin_axes(kit_items) -> list[str]:
    have = kit_coverage(kit_items)
    return [a for a in COVERAGE_AXES if a not in have]


def capability_matrix(divers: dict[str, list]) -> dict[str, list[str]]:
    """axis -> [role names that hold it]. `divers` maps role_name -> kit item list."""
    matrix: dict[str, list[str]] = {a: [] for a in COVERAGE_AXES}
    for role_name, kit in divers.items():
        have = kit_coverage(kit)
        for a in COVERAGE_AXES:
            if a in have:
                matrix[a].append(role_name)
    return matrix


def cover_owner(axis: str, matrix: dict[str, list[str]], exclude: str) -> str | None:
    """A teammate (not `exclude`) who is deep on this axis, to name in the brief."""
    holders = [r for r in matrix.get(axis, []) if r != exclude]
    return holders[0] if holders else None
