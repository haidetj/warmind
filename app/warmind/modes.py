"""The three modes are one scoring function with a different objective term.

    fun          maximise novelty against everything the player has run before
    challenge    maximise distance from the player's own play-style
    improvement  align to strengths, force exactly one unfamiliar element

Mode changes only how the objective term is weighted; the pressure sum underneath
is identical. Keep the weights small so the mission still decides the kit — the
coach grows players at the margin, it does not hand them a losing kit.
"""

from __future__ import annotations

MODES = ("fun", "challenge", "improvement", "d100")

NOVELTY_W = 0.35     # fun: reward items outside the player's history
CHALLENGE_W = 0.30   # challenge: penalise items inside the player's comfort zone
IMPROVE_W = 0.30     # improvement: reward items inside the player's comfort zone

# D100 ("Helldive∞"): the mission's difficulty setting no longer caps the ask.
# Roles stretch like challenge but twice as hard, the meta prior is inverted so
# S-tier crutches sink and off-meta kit wins ties, and the mission pressure is
# amplified so the kit leans harder into what the map demands. The pressure sum
# still dominates, so the kit stays mission-relevant — brutal, not hopeless.
D100_COMFORT_W = 0.60
D100_META_W = -0.8    # replaces the +1.0 base-grade weight
D100_PRESSURE = 1.6


def item_term(item, play_style, history: set[str], mode: str) -> float:
    """The mode-dependent nudge on a single item's score."""
    comfort = len(item.tags & play_style.signature)
    if mode == "fun":
        return NOVELTY_W * (0.0 if item.name in history else 1.0)
    if mode == "challenge":
        return -CHALLENGE_W * comfort
    if mode == "improvement":
        return IMPROVE_W * comfort
    if mode == "d100":
        return -D100_COMFORT_W * comfort
    return 0.0


def role_objective(affinity: float, mode: str) -> float:
    """Objective for assigning a player (with this role-affinity) to a role.
    improvement wants high affinity; challenge/d100 want low; fun is neutral on
    role and expresses novelty at the item level."""
    if mode == "improvement":
        return affinity
    if mode in ("challenge", "d100"):
        return -affinity
    return 0.0
