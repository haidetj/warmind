"""Loadout rules that make kits work in the actual game.

Researched 2026-10-27 (patch 7.2.0); every rule id, statement and source lives in
data/kit_rules.yaml, and the long-form notes in docs/loadout-research.md.

Two layers:
- diver_allows(): hard per-diver limits applied while a kit is filled — one held
  support weapon (plus one expendable beside it), one backpack-slot item, an Eagle
  cap (shared rearm), a cap on stationary emplacements, one vehicle.
- review_squad(): after every kit is filled, a squad pass that removes redundancy
  and closes coverage gaps (anti-tank depth, chaff and structure floors), returning
  translatable notes for each change and each check.
"""

from __future__ import annotations

from . import loader

STATIC = {"sentry", "emplacement", "mine", "relay"}
STRIKES = {"eagle", "orbital"}
SUPPLY_PACK = "B-1 Supply Pack"
BUDDY_RELOAD = {"GR-8 Recoilless Rifle", "FAF-14 Spear"}   # weak without a loader in small squads
STACKABLE_EAT = "EAT-17 Expendable Anti-Tank"
SHIELD_RELAY = "FX-12 Shield Generator Relay"


def rules() -> dict:
    """{rule_id: {"rule", "scope", "sources"}} for display."""
    return {r["id"]: r for r in loader._load("kit_rules.yaml")["rules"]}


def eagle_cap(role_name: str) -> int:
    return 3 if role_name == "FIRES" else 2


def static_cap(role_name: str, commando: bool) -> int:
    if commando:
        return 0
    return 3 if role_name == "HARDPOINT" else 2


def diver_allows(cand, picks, role_name: str, commando: bool = False) -> bool:
    """Can `cand` join a diver who already holds `picks`?"""
    if cand.category == "support":
        mains = [p for p in picks if p.category == "support" and not p.expendable]
        exps = [p for p in picks if p.category == "support" and p.expendable]
        if cand.expendable:
            # an expendable only rides beside a real support weapon, and only one
            if exps or not mains:
                return False
        elif mains:
            return False  # one support weapon in hand; a second drops the first
    if cand.backpack and any(p.backpack for p in picks):
        return False
    if cand.category == "eagle" and sum(p.category == "eagle" for p in picks) >= eagle_cap(role_name):
        return False
    if cand.category in STATIC and sum(p.category in STATIC for p in picks) >= static_cap(role_name, commando):
        return False
    if cand.category == "vehicle" and any(p.category == "vehicle" for p in picks):
        return False
    return True


def squad_excludes(cand, squad_names: set, session) -> bool:
    """True if a squadmate already brings this and stacking it is redundancy. The squad
    shares 16 stratagem slots; only the researched stacks are allowed: Shield Generator
    Relays against Automatons, sentries when the mission is a hold, EAT-17 into heavies."""
    if cand.name not in squad_names:
        return False
    vec = session._pressure.vector
    if cand.name == SHIELD_RELAY and session.faction == "automatons":
        return False
    if cand.category == "sentry" and vec.get("sentry", 0) >= 1.0:
        return False
    if cand.name == STACKABLE_EAT and vec.get("heavy_pen", 0) >= 1.0:
        return False
    return True


def main_support(kit):
    return next((s for s in kit if s.category == "support" and not s.expendable), None)


# ---------------------------------------------------------------- squad review

def _floors(n: int) -> dict:
    big = n >= 4
    return {"at_support": 2 if big else 1, "at_strike": 1 if big else 0,
            "ch": 2 if big else 1, "st": 2 if big else 1}


def review_squad(kits: list, pool, pick, session, commando: bool = False) -> list:
    """kits: [{"pid","callsign","role", "strat": [Item]}] (mutated in place).
    pick(kit, candidates) -> best Item for that diver (scoring + ownership), or None.
    Returns [{"k","p","rule","status"}] — 'fixed' for swaps made, 'ok'/'gap' per check."""
    n = len(kits)
    f = _floors(n)
    out = []

    def squad_names(skip=None):
        return {s.name for k in kits if k is not skip for s in k["strat"]}

    def swap(kit, old, cands, rule, key):
        others = [s for s in kit["strat"] if s is not old]
        names = squad_names(kit)
        ok = [c for c in cands if c.name not in {s.name for s in others}
              and not squad_excludes(c, names, session)
              and diver_allows(c, others, kit["role"], commando)]
        new = pick(kit, ok) if ok else None
        if new is None or new.name == old.name:
            return False
        kit["strat"][kit["strat"].index(old)] = new
        out.append({"k": key, "p": {"callsign": kit["callsign"], "from": old.name, "to": new.name},
                    "rule": rule, "status": "fixed"})
        return True

    # 1. anti-tank depth: enough divers whose held support weapon kills heavies
    def at_divers():
        return [k for k in kits if (main_support(k["strat"]) and "at" in main_support(k["strat"]).coverage)
                or (n <= 3 and any(s.category == "support" and "at" in s.coverage for s in k["strat"]))]
    order = ["HAMMER", "LONG ARM", "FORWARD EYE", "HARDPOINT", "FIRES"]
    for kit in sorted(kits, key=lambda k: order.index(k["role"]) if k["role"] in order else 9):
        if len(at_divers()) >= f["at_support"]:
            break
        old = main_support(kit["strat"])
        if old is None or "at" in old.coverage:
            continue
        cands = [s for s in pool.stratagems if s.category == "support" and not s.expendable and "at" in s.coverage]
        swap(kit, old, cands, "at_depth", "rev.fix.at")
    have = len(at_divers())
    out.append({"k": "rev.chk.at", "p": {"a": have, "b": f["at_support"]}, "rule": "at_depth",
                "status": "ok" if have >= f["at_support"] else "gap"})

    # 2. at least one heavy-armour strike in a full squad
    def at_strikes():
        return sum(1 for k in kits for s in k["strat"] if s.category in STRIKES and "at" in s.coverage)
    if at_strikes() < f["at_strike"]:
        for kit in sorted(kits, key=lambda k: 0 if k["role"] == "FIRES" else 1):
            olds = [s for s in kit["strat"] if s.category in STRIKES and "at" not in s.coverage]
            if olds and swap(kit, olds[-1], [s for s in pool.stratagems if s.category in STRIKES and "at" in s.coverage],
                             "at_depth", "rev.fix.strike"):
                break

    # 3. chaff and structure floors across the squad's stratagems
    for axis, rule in (("ch", "chaff_floor"), ("st", "structure_floor")):
        def count():
            return sum(1 for k in kits for s in k["strat"] if axis in s.coverage)
        if count() < f[axis]:
            at_sources = sum(1 for k in kits for s in k["strat"] if "at" in s.coverage)
            for kit in kits:
                # swap a pick that lacks the axis; an anti-tank one only if the squad keeps another
                olds = sorted([s for s in kit["strat"] if s.category not in ("support", "backpack")
                               and axis not in s.coverage and ("at" not in s.coverage or at_sources > 1)],
                              key=lambda s: "at" in s.coverage)
                if olds and swap(kit, olds[0], [s for s in pool.stratagems if axis in s.coverage
                                                  and s.category not in ("support", "backpack")],
                                 rule, "rev.fix." + axis):
                    if count() >= f[axis]:
                        break
        c = count()
        out.append({"k": "rev.chk." + axis, "p": {"a": c, "b": f[axis]}, "rule": rule,
                    "status": "ok" if c >= f[axis] else "gap"})

    # 4. redundancy report (duplicates are prevented while filling; this confirms it)
    sup = [s.name for k in kits for s in k["strat"] if s.category == "support" and not s.expendable]
    dup = len(sup) - len(set(sup))
    out.append({"k": "rev.chk.dupes", "p": {"n": dup}, "rule": "no_duplicate_support_weapon",
                "status": "ok" if dup == 0 else "gap"})
    packs = sum(1 for k in kits for s in k["strat"] if s.name == SUPPLY_PACK)
    if packs:
        out.append({"k": "rev.chk.supply", "p": {}, "rule": "one_supply_pack", "status": "ok"})
    return out
