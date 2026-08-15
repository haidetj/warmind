"""The three modes are one scoring function with a different objective term.

    fun          maximise novelty against everything the player has run before
    challenge    maximise distance from the player's own play-style
    improvement  align to strengths, force exactly one unfamiliar element

Mode changes only how the objective term is weighted; the pressure sum underneath
is identical. Keep the weights small so the mission still decides the kit — the
coach grows players at the margin, it does not hand them a losing kit.
"""

from __future__ import annotations

MODES = ("fun", "challenge", "improvement")

NOVELTY_W = 0.35     # fun: reward items outside the player's history
CHALLENGE_W = 0.30   # challenge: penalise items inside the player's comfort zone
IMPROVE_W = 0.30     # improvement: reward items inside the player's comfort zone


def item_term(item, play_style, history: set[str], mode: str) -> float:
    """The mode-dependent nudge on a single item's score."""
    comfort = len(item.tags & play_style.signature)
    if mode == "fun":
        return NOVELTY_W * (0.0 if item.name in history else 1.0)
    if mode == "challenge":
        return -CHALLENGE_W * comfort
    if mode == "improvement":
        return IMPROVE_W * comfort
    return 0.0


def role_objective(affinity: float, mode: str) -> float:
    """Objective for assigning a player (with this role-affinity) to a role.
    improvement wants high affinity; challenge wants low; fun is neutral on role
    and expresses novelty at the item level."""
    if mode == "improvement":
        return affinity
    if mode == "challenge":
        return -affinity
    return 0.0
