"""How hard a weapon is to use well, from its wiki stats, matched to the diver's numbers.

demand(name) in [0, 1]: recoil, rate of fire and magazine size, each ranked against the
other weapons in the same slot (so a primary is compared with primaries). High recoil, a
slow rate and a small magazine mean every shot has to land: demanding. A low-recoil
bullet hose with a deep magazine is forgiving, and so is splash damage (explosive
weapons count 40% less) and pellet spread (shotguns 25% less, except slug-firing ones).

skill(acc) in [0, 1]: career accuracy (shots hit / fired) mapped from 45% to 75%.

fit(...) is the score nudge for a weapon given the mode:
  optimize / fun : don't hand a demanding weapon to someone it will punish; a precise
                   diver gets a small bonus for a weapon that rewards aim.
  improvement    : a little above the diver's comfort.
  challenge      : train the weak spot: the lower the accuracy, the more the kit asks
                   for aim (high recoil, slow single shots).
  d100           : the most demanding weapons.
"""

from __future__ import annotations

from functools import lru_cache

from . import loader

ACC_LO, ACC_HI = 0.45, 0.75
W = {"recoil": 0.45, "rpm": 0.35, "capacity": 0.20}   # recoil matters most, then rate, then magazine


def _rank(values: dict) -> dict:
    """{name: value} -> {name: percentile 0..1} (ties share the mean rank)."""
    order = sorted(values.values())
    n = len(order)
    if n < 2:
        return {k: 0.5 for k in values}
    out = {}
    for k, v in values.items():
        lo = order.index(v)
        hi = n - 1 - order[::-1].index(v)
        out[k] = (lo + hi) / 2 / (n - 1)
    return out


@lru_cache(maxsize=1)
def _table() -> dict:
    meta, raw = loader.armory_meta(), loader.items()
    out = {}
    for slot in ("primaries", "secondaries"):
        st = {r["name"]: (meta.get(r["name"]) or {}).get("stats") or {} for r in raw.get(slot, [])}
        cover = {r["name"]: set(r.get("coverage") or []) for r in raw.get(slot, [])}
        ranks = {}
        for key in W:
            vals = {n: s[key] for n, s in st.items() if isinstance(s.get(key), (int, float))}
            ranks[key] = _rank(vals)
        for n in st:
            parts, wsum = 0.0, 0.0
            for key, w in W.items():
                if n in ranks[key]:
                    pct = ranks[key][n]
                    parts += w * (pct if key == "recoil" else 1 - pct)   # slow rate / small mag = demanding
                    wsum += w
            if wsum >= 0.5:   # need at least recoil + one more (or rate + magazine) to say anything
                d = parts / wsum
                if "st" in cover.get(n, ()):   # explosive: splash forgives a miss, so it asks less of the aim
                    d *= 0.6
                elif (meta.get(n) or {}).get("group") == "Shotguns" and "Slugger" not in n:
                    d *= 0.75                   # pellet spread forgives aim too (the Slugger fires slugs)
                out[n] = round(d, 3)
    return out


def demand(name: str) -> float | None:
    return _table().get(name)


def skill(accuracy: float | None) -> float | None:
    if accuracy is None or accuracy <= 0:
        return None
    return max(0.0, min(1.0, (accuracy - ACC_LO) / (ACC_HI - ACC_LO)))


def fit(name: str, sk: float | None, mode: str) -> float:
    """Score nudge for carrying this weapon (0 when either side is unknown)."""
    d = demand(name)
    if d is None or sk is None:
        return 0.0
    if mode in ("optimize", "fun"):
        over = max(0.0, d - (sk + (0.15 if mode == "optimize" else 0.3)))
        # optimize is about performance: a weapon that punishes the diver's aim costs real damage
        return -(1.6 if mode == "optimize" else 0.9) * over + (0.3 * sk * d if mode == "optimize" else 0.0)
    if mode == "improvement":
        return -0.6 * abs(d - min(1.0, sk + 0.2))
    if mode == "challenge":
        return -0.8 * abs(d - (1.0 - 0.5 * sk))
    if mode == "d100":
        return -0.6 * (1.0 - d)
    return 0.0


def why(name: str, sk: float | None, mode: str) -> str | None:
    """Which handling phrase explains this pick, if handling shaped it."""
    d = demand(name)
    if d is None or sk is None:
        return None
    if mode in ("challenge", "improvement", "d100") and d >= 0.6 and sk < 0.5:
        return "drill"      # demanding weapon on purpose: an aim drill for a diver whose aim needs it
    if mode in ("optimize", "fun") and sk < 0.4 and d <= 0.4:
        return "forgiving"  # forgiving weapon for a diver who's still finding their aim
    if mode == "optimize" and sk >= 0.7 and d >= 0.6:
        return "precise"    # a weapon that rewards the diver's accuracy
    return None
