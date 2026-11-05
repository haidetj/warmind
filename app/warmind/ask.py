"""What an item asks of the diver, and which of the diver's habits a Challenge should break.

ask(item) in [0, 1] with a reason: weapons from their wiki handling (handling.demand),
everything else from data/ask.yaml. Challenge and D100 add a term that rewards a high
ask, so a hard kit wins over a forgiving one when both answer the mission: Recoilless
over Quasar, Precision Strike over Orbital Laser, Light armour over Heavy.

drills(derived) reads the diver's career rates (stats.derive) and names up to two
habits to break, each as a scoring nudge:
  survive  dies a lot          -> no safety net: crutch picks (shield, dogs, Heavy) cost more
  tidy     rarely dies          -> glass cannon: lighter armour, no safety net either
  eagles   leans on Eagles      -> orbitals and support fire instead of the usual Eagles
  orbitals leans on orbitals    -> Eagles and support fire instead of the usual orbitals
  turrets  lives behind statics -> no sentries or emplacements: hold ground with your own gun
  clean    friendly kills       -> precision over splash: danger-close kit costs more
Each drill only nudges; the mission's pressure still decides what the kit must answer.
"""

from __future__ import annotations

from functools import lru_cache

from . import handling, loader

# mode -> weight on (ask - ASK_MID); challenge and d100 want hard kit, improvement a little
ASK_W = {"challenge": 1.0, "d100": 2.4, "improvement": 0.25}
ASK_MID = 0.4
D100_CRUTCH = -1.2   # Helldive∞ restricts the kit: crutch gear only if nothing else fits
DRILL_W = 0.7

DRILLS = ("survive", "tidy", "eagles", "orbitals", "turrets", "clean")


@lru_cache(maxsize=1)
def _table() -> dict:
    return loader._load("ask.yaml")


def ask(item) -> tuple[float | None, str | None]:
    """(ask, reason) for an item; (None, None) when there's nothing to go on."""
    t = _table()
    if item.slot in ("primary", "secondary"):
        d = handling.demand(item.name)
        if d is None:
            return None, None
        return d, ("precision" if d >= 0.6 else "crutch" if d <= 0.2 else None)
    if item.slot == "armor":
        base, reason = t["armor_weight"].get(item.weight, [0.4, None])
        delta = t.get("armor_passive", {}).get(item.passive, 0.0)
        v = max(0.0, min(1.0, base + delta))
        return v, ("crutch" if delta < 0 else reason)   # a defensive passive is a safety net
    rec = t["items"].get(item.name)
    if rec:
        return float(rec[0]), rec[1]
    key = "grenade" if item.slot == "grenade" else item.category
    v = t["defaults"].get(key)
    return (float(v), None) if v is not None else (None, None)


# Helldive∞ boosters: none of the safety nets (extra lives, damage resistance, a free resupply on drop)
D100_NO_BOOST = {"Vitality Enhancement", "Hellpod Space Optimization", "Increased Reinforcement Budget",
                 "Flexible Reinforcement Budget", "Stun Pods", "Firebomb Hellpods", "Armed Resupply Pods",
                 "Surplus EAT Allocation", "Expert Extraction Pilot"}


def is_crutch(item) -> bool:
    return ask(item)[1] == "crutch"


def ask_term(item, mode: str) -> float:
    w = ASK_W.get(mode)
    if not w:
        return 0.0
    v, reason = ask(item)
    if v is None:
        return 0.0
    return w * (v - ASK_MID) + (D100_CRUTCH if mode == "d100" and reason == "crutch" else 0.0)


def drills(derived: dict | None, mode: str) -> list[str]:
    """Up to two habits to break, strongest signal first (Challenge / D100 only)."""
    if mode not in ("challenge", "d100") or not derived:
        return []
    g = lambda k: float(derived.get(k) or 0.0)
    cand = []
    dpm = g("deaths_per_mission")
    if dpm >= 2.5:
        cand.append((min(1.0, (dpm - 2.5) / 2 + 0.5), "survive"))
    elif 0 < dpm <= 1.0:
        cand.append((0.5 + (1.0 - dpm) / 2, "tidy"))
    if g("eagle_share") >= 0.4:
        cand.append((g("eagle_share"), "eagles"))
    if g("orb_share") >= 0.4:
        cand.append((g("orb_share"), "orbitals"))
    if g("def_share") >= 0.25:
        cand.append((g("def_share") + 0.3, "turrets"))
    if g("friendly_per_mission") >= 0.5:
        cand.append((min(1.0, g("friendly_per_mission") / 2 + 0.4), "clean"))
    cand.sort(reverse=True)
    return [k for _, k in cand[:2]]


def drill_term(item, active: list[str]) -> float:
    """Score nudge for an item under the diver's drills."""
    if not active:
        return 0.0
    v, reason = ask(item)
    s = 0.0
    for d in active:
        if d in ("survive", "tidy") and reason == "crutch":
            s -= DRILL_W
        if d == "tidy" and item.slot == "armor":
            s += {"Light": 0.5, "Medium": 0.0, "Heavy": -0.5}.get(item.weight, 0.0)
        if d == "eagles" and item.category == "eagle":
            s -= DRILL_W
        if d == "orbitals" and item.category == "orbital":
            s -= DRILL_W
        if d == "turrets" and item.category in ("sentry", "emplacement"):
            s -= DRILL_W
        if d == "clean":
            if reason == "danger_close":
                s -= DRILL_W
            elif reason == "precision":
                s += 0.3
    return s


def armor_weight_for(role_weight: str, active: list[str], quiet: bool, mode: str = "") -> str:
    """The armour weight class to fill: the role's, one step lighter for a glass-cannon
    drill, never Heavy on a quiet run."""
    w = role_weight
    if mode == "d100":
        return "Light"   # Helldive∞: everyone goes light, one mistake and you're down
    if "tidy" in active:
        w = {"Heavy": "Medium", "Medium": "Light"}.get(w, w)
    if quiet and w == "Heavy":
        w = "Medium"
    return w
