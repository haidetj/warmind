"""Load the YAML seed data. One cached read per file."""

from __future__ import annotations

import functools
import pathlib

import yaml

DATA = pathlib.Path(__file__).resolve().parent / "data"


@functools.lru_cache(maxsize=None)
def _load(name: str):
    with open(DATA / name) as fh:
        return yaml.safe_load(fh)


def hazards() -> dict:
    """hazard_id -> {description, modifiers:{kit_tag: float}, ...}."""
    return _load("hazards.yaml")


def missions() -> dict:
    """mission_id -> mission record."""
    return {m["id"]: m for m in _load("missions.yaml")}


def tactical_objectives() -> dict:
    """objective_id -> record."""
    return {t["id"]: t for t in _load("tactical_objectives.yaml")}


def mission_tag_modifiers() -> dict:
    """situation_tag -> {description, modifiers:{kit_tag: float}}."""
    return _load("mission_tag_modifiers.yaml")


def items() -> dict:
    """The raw items.yaml (primaries, secondaries, grenades, stratagems, armor, boosters)."""
    return _load("items.yaml")


def kit_tag_vocabulary() -> set[str]:
    """The closed set of kit tags, defined by hazards + situation modifiers."""
    vocab: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            for key, val in node.items():
                if key == "modifiers" and isinstance(val, dict):
                    vocab.update(val.keys())
                else:
                    walk(val)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    walk(hazards())
    for rec in mission_tag_modifiers().values():
        vocab.update((rec.get("modifiers") or {}).keys())
    return vocab
