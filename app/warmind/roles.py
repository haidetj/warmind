"""Battlefield roles and player play-styles.

A ROLE is a kit shape (a slot prescription + a signature). A PLAY_STYLE is how a
player actually behaves, read from career stats (already named in squad.json).
Role SELECTION is driven by the mission's pressure; role ASSIGNMENT (which player
gets which role) is driven by the mode — align to strength, or push away from it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Role:
    name: str
    # kit tags that define the role's fit; dotted with pressure to rank relevance
    signature: frozenset
    armor_weight: str
    # four stratagem slots, each a set of acceptable categories (priority by order)
    slots: tuple
    primary_pref: frozenset = frozenset()   # soft kit-tag preference on the primary
    grenade_cover: str = ""                  # preferred grenade coverage axis
    reactive: bool = False                   # holds the reactive-stratagem permission
    blurb: str = ""


ROLES: dict[str, Role] = {
    "HARDPOINT": Role(
        name="HARDPOINT",
        signature=frozenset({"static_position", "sentry", "shield_pack", "sustain_fire"}),
        armor_weight="Heavy",
        slots=({"relay"}, {"sentry"}, {"sentry", "emplacement"}, {"sentry", "emplacement", "mine"}),
        primary_pref=frozenset({"stagger_primary", "close_quarters"}),
        grenade_cover="ch",
        reactive=False,
        blurb="Holds the ground. Builds the killzone before contact so the squad's slots are freed.",
    ),
    "HAMMER": Role(
        name="HAMMER",
        signature=frozenset({"heavy_pen", "support_weapon"}),
        armor_weight="Medium",
        slots=({"support"}, {"support"}, {"eagle", "orbital"}, {"orbital", "eagle"}),
        primary_pref=frozenset({"strong_primary"}),
        grenade_cover="at",
        reactive=True,
        blurb="The squad's anti-armour depth. Arms objectives, kills what the killzone doesn't.",
    ),
    "FORWARD_EYE": Role(
        name="FORWARD EYE",
        signature=frozenset({"mobility", "jump_pack", "marksman", "radar_booster"}),
        armor_weight="Light",
        slots=({"support"}, {"backpack"}, {"orbital"}, {"eagle"}),
        primary_pref=frozenset({"marksman", "ranged"}),
        grenade_cover="bc",
        reactive=False,
        blurb="Operates a beat ahead. Solves poor intel; never fights the squad's battle.",
    ),
    "FIRES": Role(
        name="FIRES",
        signature=frozenset({"eagle", "orbital"}),
        armor_weight="Medium",
        slots=({"orbital"}, {"orbital"}, {"eagle"}, {"eagle"}),
        primary_pref=frozenset({"strong_primary"}),
        grenade_cover="ch",
        reactive=False,
        blurb="One heavy barrage on the marked drop zone as the first dropship commits.",
    ),
    "LONG_ARM": Role(
        name="LONG ARM",
        signature=frozenset({"high_rof_ballistic", "sustain_fire", "guard_dog", "support_weapon"}),
        armor_weight="Medium",
        slots=({"support"}, {"backpack"}, {"sentry"}, {"eagle"}),
        primary_pref=frozenset({"high_rof_ballistic"}),
        grenade_cover="ch",
        reactive=False,
        blurb="Sustained chaff and anti-air. Carries the volume so the anchors carry the armour.",
    ),
}


@dataclass(frozen=True)
class PlayStyle:
    key: str
    label: str
    # kit tags this player over-uses — their comfort zone; challenge pushes off these
    signature: frozenset
    # role -> affinity 0..1; improvement aligns to high, challenge to low
    affinity: dict = field(default_factory=dict, hash=False, compare=False)


PLAY_STYLES: dict[str, PlayStyle] = {
    "siege_anchor": PlayStyle(
        "siege_anchor", "Siege Anchor",
        signature=frozenset({"sentry", "static_position", "shield_pack"}),
        affinity={"HARDPOINT": 1.0, "LONG_ARM": 0.5, "HAMMER": 0.3, "FIRES": 0.3, "FORWARD_EYE": 0.1},
    ),
    "danger_close": PlayStyle(
        "danger_close", "Danger Close",
        signature=frozenset({"eagle", "orbital"}),
        affinity={"FIRES": 1.0, "HAMMER": 0.6, "LONG_ARM": 0.4, "HARDPOINT": 0.3, "FORWARD_EYE": 0.2},
    ),
    "fire_for_effect": PlayStyle(
        "fire_for_effect", "Fire for Effect",
        signature=frozenset({"orbital"}),
        affinity={"FIRES": 1.0, "HAMMER": 0.5, "LONG_ARM": 0.4, "HARDPOINT": 0.3, "FORWARD_EYE": 0.2},
    ),
    "by_the_book": PlayStyle(
        "by_the_book", "By the Book",
        signature=frozenset(),
        affinity={"HAMMER": 0.6, "HARDPOINT": 0.6, "FORWARD_EYE": 0.6, "FIRES": 0.6, "LONG_ARM": 0.6},
    ),
    "forward_eye": PlayStyle(
        "forward_eye", "Forward Eye",
        signature=frozenset({"mobility", "jump_pack", "marksman"}),
        affinity={"FORWARD_EYE": 1.0, "LONG_ARM": 0.4, "HAMMER": 0.4, "FIRES": 0.3, "HARDPOINT": 0.2},
    ),
}


def play_style(key: str) -> PlayStyle:
    return PLAY_STYLES.get(key, PLAY_STYLES["by_the_book"])


def role_fit(role: Role, pressure) -> float:
    """How much the mission's pressure calls for this role's signature."""
    return sum(pressure.get(tag) for tag in role.signature)


def select_roles(pressure, squad_size: int, *, poor_intel: bool = False) -> list[str]:
    """Pick which roles to field. The two anchors (HAMMER, HARDPOINT) come first when
    their fit is positive; FORWARD_EYE is forced under poor intel; the rest fill by fit."""
    ranked = sorted(ROLES, key=lambda r: role_fit(ROLES[r], pressure), reverse=True)

    chosen: list[str] = []

    def add(role_key: str) -> None:
        if role_key not in chosen and len(chosen) < squad_size:
            chosen.append(role_key)

    # anchors first, if the mission wants them at all
    if role_fit(ROLES["HAMMER"], pressure) >= 0:
        add("HAMMER")
    if role_fit(ROLES["HARDPOINT"], pressure) > 0:
        add("HARDPOINT")
    if poor_intel:
        add("FORWARD_EYE")
    for role_key in ranked:
        add(role_key)
    return chosen[:squad_size]
