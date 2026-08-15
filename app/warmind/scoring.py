"""The one scoring function.

    score(item) = base_grade(item, faction)      # provisional meta prior (compressed)
                + Σ pressure(tag) for tag in item.tags   # the mission + planet read
                + mode_term(item, player)         # fun / challenge / improvement nudge

base_grade is intentionally small next to the pressure sum: the mission decides the
kit, the meta only breaks ties. When the u.gg parser lands real grades, only the
GRADE_SCALE table and this weight change — the rest of the resolver is unaffected.
"""

from __future__ import annotations

from . import modes

W_BASE = 1.0  # grades are already compressed to ~[-0.6, 1.0]; pressure sums larger


def pressure_dot(item, pressure) -> float:
    return sum(pressure.get(tag) for tag in item.tags)


def score(item, pressure, faction: str, play_style, history: set[str], mode: str) -> float:
    return (
        W_BASE * item.base_grade(faction)
        + pressure_dot(item, pressure)
        + modes.item_term(item, play_style, history, mode)
    )
