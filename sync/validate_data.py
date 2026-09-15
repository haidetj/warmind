#!/usr/bin/env python3
"""Validate that the WARMIND seed is internally coherent.

This is the gate that keeps the data from silently going "out of whack": a bad
edit (a mission tagged with a situation the bridge doesn't map, an item tagged
with a kit tag no modifier uses, a difficulty gate that can never be played) is
caught here instead of quietly producing wrong loadouts.

Run on every push (CI) and before any auto-drafted data PR is opened.

    python3 sync/validate_data.py          # exits 1 on any problem
"""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

from warmind import loader  # noqa: E402

COVERAGE_AXES = {"at", "st", "ch", "bc"}


def check() -> list[str]:
    problems: list[str] = []
    vocab = loader.kit_tag_vocabulary()
    situation = loader.mission_tag_modifiers()
    situation_tags = set(situation)
    missions = loader.missions()
    tacticals = loader.tactical_objectives()
    items = loader.items()

    def bad(msg):
        problems.append(msg)

    # 1. situation modifiers only emit kit tags in the closed vocabulary
    for tag, rec in situation.items():
        for kt in (rec.get("modifiers") or {}):
            if kt not in vocab:
                bad(f"situation '{tag}' emits unknown kit tag '{kt}'")

    # 2. every mission's situation tags are known to the bridge
    for mid, m in missions.items():
        for t in m.get("tags", []):
            if t not in situation_tags:
                bad(f"mission '{mid}' uses situation tag '{t}' not in mission_tag_modifiers")
        dmin, dmax = m.get("difficulty_min", 1), m.get("difficulty_max", 10)
        if not (1 <= dmin <= dmax <= 10):
            bad(f"mission '{mid}' has an impossible difficulty gate {dmin}-{dmax}")
        if not m.get("factions"):
            bad(f"mission '{mid}' has no factions")

    # 3. tactical objectives
    for tid, t in tacticals.items():
        for tag in t.get("tags", []):
            if tag not in situation_tags:
                bad(f"tactical '{tid}' uses situation tag '{tag}' not in mission_tag_modifiers")
        dmin, dmax = t.get("difficulty_min", 1), t.get("difficulty_max", 10)
        if not (1 <= dmin <= dmax <= 10):
            bad(f"tactical '{tid}' has an impossible difficulty gate {dmin}-{dmax}")

    # 4. hazards emit only vocabulary kit tags
    for hid, h in loader.hazards().items():
        for kt in (h.get("modifiers") or {}):
            if kt not in vocab:
                bad(f"hazard '{hid}' emits unknown kit tag '{kt}'")

    # 5. items: coverage axes valid, tags in vocabulary, grades present
    seen_names = set()
    for group in ("primaries", "secondaries", "grenades", "stratagems", "armor"):
        for it in items.get(group, []):
            name = it.get("name", "?")
            if name in seen_names:
                bad(f"duplicate item name '{name}'")
            seen_names.add(name)
            for c in it.get("coverage", []):
                if c not in COVERAGE_AXES:
                    bad(f"item '{name}' has invalid coverage axis '{c}'")
            for kt in it.get("tags", []):
                if kt not in vocab:
                    bad(f"item '{name}' has kit tag '{kt}' not in the closed vocabulary")

    # 6. roles reference only vocabulary tags (guards the resolver)
    from warmind.roles import ROLES, PLAY_STYLES
    for key, role in ROLES.items():
        for t in role.signature:
            if t not in vocab:
                bad(f"role '{key}' signature tag '{t}' not in vocabulary")
    for key, ps in PLAY_STYLES.items():
        for t in ps.signature:
            if t not in vocab:
                bad(f"play_style '{key}' signature tag '{t}' not in vocabulary")

    # 7. the golden pressure target still resolves (the one join the whole app rests on)
    from warmind import pressure
    p = pressure.compose(mission_id="neutralize_ground_to_orbit")
    target = {"sentry": 1.80, "static_position": 1.40, "shield_pack": 1.30, "mobility": -0.50}
    for tag, want in target.items():
        if abs(p.get(tag) - want) > 1e-9:
            bad(f"golden pressure target drifted: {tag}={p.get(tag)} want {want}")

    return problems


def main():
    problems = check()
    m = loader.missions()
    print(f"missions={len(m)} tacticals={len(loader.tactical_objectives())} "
          f"hazards={len(loader.hazards())} kit_tags={len(loader.kit_tag_vocabulary())}")
    if problems:
        print(f"\nFAILED — {len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)
    print("OK — seed is internally coherent.")


if __name__ == "__main__":
    main()
