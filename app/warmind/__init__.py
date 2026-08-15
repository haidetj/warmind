"""WARMIND — a Helldivers 2 squad coach.

The resolver composes one additive score over a closed kit-tag vocabulary:

    score(item) = base_grade(item, faction)          # provisional meta prior
                + Σ pressure(kit_tag) · item.tags     # planet hazards + mission situation
                + mode_term(item, player)             # fun / challenge / improvement

Pressure is the sum of hazard modifiers (from the planet) and situation
modifiers (from the mission + tactical overlay), both resolved into the same
kit-tag space by data/mission_tag_modifiers.yaml. The coach grows players by
exposing tactics they don't use while playing to what they are good at — it
never handicaps. See handoff/HANDOFF.md §5.
"""

__version__ = "0.1.0"
