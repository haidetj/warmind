"""The kit compass: where a loadout sits on two axes.

  quiet (-1) ... loud (+1)        stealth kit, light armour  vs  statics, big strikes, splash, Heavy
  hold  (-1) ... push (+1)        sentries, shields, emplacements  vs  strikes, mobility, close assault

Scored from each item's tags, category and "ask" reason, then squashed into [-1, 1].
The squad's point is the average of its divers'.
"""

from __future__ import annotations

import math

from . import ask as ask_mod

LOUD = {"stealth": -1.0, "static_position": 0.6, "sentry": 0.6, "fire_kit": 0.3, "high_rof_ballistic": 0.2,
        "close_quarters": 0.1, "marksman": -0.3, "mobility": -0.2}
PUSH = {"static_position": -1.0, "sentry": -0.8, "shield_pack": -0.6, "guard_dog": -0.2, "mobility": 0.6,
        "jump_pack": 0.5, "close_quarters": 0.4, "fire_kit": 0.2, "melee": 0.4, "heavy_pen": 0.2, "ranged": -0.2,
        "marksman": -0.2}
CAT_LOUD = {"eagle": 0.5, "orbital": 0.5, "sentry": 0.7, "emplacement": 0.7, "mine": 0.1, "vehicle": 0.6}
CAT_PUSH = {"eagle": 0.4, "orbital": 0.3, "sentry": -0.8, "emplacement": -1.0, "mine": -0.6, "relay": -0.8, "vehicle": 0.5}
WEIGHT = {"Light": (-0.6, 0.4), "Medium": (0.0, 0.0), "Heavy": (0.5, -0.5)}


def _squash(x: float) -> float:
    return round(math.tanh(x / 5.0), 3)


def point(items) -> dict:
    loud = push = 0.0
    for it in items:
        if it is None:
            continue
        for t in it.tags:
            loud += LOUD.get(t, 0.0)
            push += PUSH.get(t, 0.0)
        loud += CAT_LOUD.get(it.category, 0.0)
        push += CAT_PUSH.get(it.category, 0.0)
        if it.slot == "armor":
            dl, dp = WEIGHT.get(it.weight, (0.0, 0.0))
            loud += dl
            push += dp
        _, reason = ask_mod.ask(it)
        if reason == "danger_close":
            loud += 0.4
        elif reason == "setup":
            push -= 0.3
        elif reason == "mobile":
            push += 0.3
    return {"loud": _squash(loud), "push": _squash(push)}


def squad(points: list[dict]) -> dict | None:
    if not points:
        return None
    return {"loud": round(sum(p["loud"] for p in points) / len(points), 3),
            "push": round(sum(p["push"] for p in points) / len(points), 3)}
