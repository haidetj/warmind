"""Compose the kit-tag pressure vector for a situation.

    pressure = Σ hazard modifiers (planet)
             + Σ situation modifiers (mission tags)
             + Σ situation modifiers (tactical-objective tags, the runtime overlay)

All three resolve into the SAME closed kit-tag space (see loader.kit_tag_vocabulary),
because data/mission_tag_modifiers.yaml maps every situation tag into the kit tags
that data/hazards.yaml already uses. The resolver is then one dot product away from
a scored item (see scoring.py).

The single most important invariant in the project lives here: situation tags and
kit tags never share a namespace. Missions carry situation tags only; this file is
the bridge. See data/mission_tag_modifiers.yaml for why.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from . import loader


@dataclass
class Pressure:
    vector: dict[str, float] = field(default_factory=dict)
    # kit_tag -> list of (source_label, delta), for explaining the read
    contributors: dict[str, list[tuple[str, float]]] = field(default_factory=dict)
    # capabilities a tactical objective *mandates* (kit_impact == "mandatory")
    mandates: list[str] = field(default_factory=list)

    def top(self, n: int = 4) -> list[tuple[str, float]]:
        """The n kit tags under the most positive pressure — the load-bearing ones."""
        return sorted(self.vector.items(), key=lambda kv: -kv[1])[:n]

    def driver(self) -> str | None:
        """The single situation/hazard source doing the most to shape the kit."""
        best, best_mag = None, 0.0
        for legs in self.contributors.values():
            for label, delta in legs:
                if abs(delta) > best_mag:
                    best, best_mag = label, abs(delta)
        return best

    def get(self, tag: str) -> float:
        return self.vector.get(tag, 0.0)


def compose(
    planet_hazards: list[str] | None = None,
    mission_id: str | None = None,
    tactical_ids: list[str] | None = None,
) -> Pressure:
    planet_hazards = planet_hazards or []
    tactical_ids = tactical_ids or []

    vec: dict[str, float] = defaultdict(float)
    contrib: dict[str, list[tuple[str, float]]] = defaultdict(list)
    mandates: list[str] = []

    hazards = loader.hazards()
    situation = loader.mission_tag_modifiers()
    missions = loader.missions()
    tacticals = loader.tactical_objectives()

    def apply(modifiers: dict, label: str) -> None:
        for kit_tag, delta in (modifiers or {}).items():
            vec[kit_tag] += delta
            contrib[kit_tag].append((label, delta))

    # --- planet (static hazards) ---
    for hz in planet_hazards:
        rec = hazards.get(hz)
        if rec:
            apply(rec.get("modifiers"), rec.get("display_name", hz))

    # --- mission (situation tags -> kit tags) ---
    if mission_id:
        mission = missions.get(mission_id)
        if mission:
            for tag in mission.get("tags", []):
                rec = situation.get(tag)
                if rec:
                    apply(rec.get("modifiers"), _sit_label(tag))

    # --- tactical overlay (runtime, only known once the map generates) ---
    for tid in tactical_ids:
        obj = tacticals.get(tid)
        if not obj:
            continue
        if obj.get("kit_impact") == "mandatory":
            mandates.append(obj["display_name"])
        for tag in obj.get("tags", []):
            rec = situation.get(tag)
            if rec:
                apply(rec.get("modifiers"), obj["display_name"])

    # drop exact-zero cancellations so the read stays legible
    vector = {k: round(v, 4) for k, v in vec.items() if round(v, 4) != 0.0}
    return Pressure(vector=vector, contributors=dict(contrib), mandates=mandates)


def _sit_label(tag: str) -> str:
    return tag.replace("_", " ")
