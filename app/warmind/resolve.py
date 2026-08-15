"""The squad resolver.

Given a session (planet + mission + difficulty + faction + mode + overlays) and a
set of players (each with a read play-style), produce one assignment per player:
a role, a full kit filled by the scoring function, a growth pick, and a rationale.
Then the squad-level brief: capability matrix, interlock loop, boosters, cadence.

Deterministic. No RNG — same inputs give the same directive, which is what lets the
AAR grade the advice later.
"""

from __future__ import annotations

import itertools
from collections import Counter
from dataclasses import dataclass, field

from . import coverage, modes, pressure as pressure_mod, roles as roles_mod, scoring
from .items import Pool

# operation modifiers we understand well enough to act on
OP_POOR_INTEL = "poor_intel"
OP_PLOTTING = "complex_stratagem_plotting"


@dataclass
class Session:
    planet_name: str = ""
    planet_hazards: list = field(default_factory=list)
    mission_id: str = ""
    faction: str = "automatons"
    difficulty: int = 7
    mode: str = "improvement"
    operation_modifiers: list = field(default_factory=list)
    tactical_objectives: list = field(default_factory=list)
    is_city_map: bool = False


@dataclass
class Player:
    id: str
    callsign: str
    play_style: str = "by_the_book"
    unlocked_warbonds: list = field(default_factory=list)
    excluded_items: list = field(default_factory=list)
    accent_hex: str = "#D9CBA3"


@dataclass
class Assignment:
    player_id: str
    callsign: str
    role: str
    primary: str
    secondary: str
    grenade: str
    armor: str
    armor_weight: str
    armor_passive: str
    booster: str
    stratagems: list
    growth_slot: str | None
    thin: list
    rationale: str


@dataclass
class Directive:
    session: Session
    pressure: pressure_mod.Pressure
    assignments: list
    capability_matrix: dict
    loop: list
    cadence: list
    reactive_role: str | None
    notes: list


# ---------------------------------------------------------------- kit filling

def _pick(cands, session, pstyle, history, *, pref_tags=frozenset(), pref_cover=None,
          cover_weight=0.3, exclude=frozenset(), squad_used=None):
    """Highest-scoring item, with soft role preferences and a squad-duplicate penalty."""
    squad_used = squad_used or Counter()
    best, best_s = None, float("-inf")
    for it in cands:
        if it.name in exclude or it.name in session_excluded(session):
            continue
        s = scoring.score(it, session._pressure, session.faction, pstyle, history, session.mode)
        s += 0.4 * len(it.tags & pref_tags)
        if pref_cover and pref_cover in it.coverage:
            s += cover_weight
        s -= 0.25 * squad_used.get(it.name, 0)
        if s > best_s:
            best, best_s = it, s
    return best


def session_excluded(session) -> set:
    return getattr(session, "_excluded", set())


def _fill_stratagems(role, pool, session, pstyle, history, squad_used):
    picks, taken, used_backpack = [], set(), False
    for slot in role.slots:
        cands = [s for s in pool.stratagems_in(slot) if s.name not in taken]
        if used_backpack:
            cands = [s for s in cands if not s.backpack]
        choice = _pick(cands, session, pstyle, history, squad_used=squad_used)
        if choice is None:  # slot categories exhausted — widen to any stratagem
            wide = [s for s in pool.stratagems if s.name not in taken and not (used_backpack and s.backpack)]
            choice = _pick(wide, session, pstyle, history, squad_used=squad_used)
        picks.append(choice)
        taken.add(choice.name)
        used_backpack = used_backpack or choice.backpack
    return picks


def _growth_pick(strat_items, pstyle, session):
    """The strongest pick that sits OUTSIDE the player's comfort — the one unfamiliar
    element the coach deliberately exposes. None if nothing is off-comfort (fun mode
    expresses novelty differently and skips this)."""
    if session.mode == "fun":
        return None
    off = [s for s in strat_items if not (s.tags & pstyle.signature)]
    if not off:
        return None
    return max(off, key=lambda s: scoring.pressure_dot(s, session._pressure)).name


# ---------------------------------------------------------------- role assignment

def _assign_roles(players, chosen_roles, mode):
    """Optimal player->role matching for the mode. improvement aligns to affinity,
    challenge maximises distance from it. N<=5 so brute force the permutations."""
    n = len(players)
    role_slots = chosen_roles[:n]
    best_perm, best_obj = None, float("-inf")
    for perm in itertools.permutations(range(n)):
        obj = 0.0
        for pi, ri in enumerate(perm):
            if ri >= len(role_slots):
                continue
            pstyle = roles_mod.play_style(players[pi].play_style)
            aff = pstyle.affinity.get(role_slots[ri], 0.3)
            obj += modes.role_objective(aff, mode) + 1e-3 * aff  # affinity breaks ties (fun)
        if obj > best_obj:
            best_obj, best_perm = obj, perm
    mapping = {}
    for pi, ri in enumerate(best_perm):
        if ri < len(role_slots):
            mapping[players[pi].id] = role_slots[ri]
    return mapping


# ---------------------------------------------------------------- boosters

_ROLE_BIAS = {"HARDPOINT": "hardpoint", "HAMMER": "hammer", "FORWARD EYE": "forward",
              "FIRES": "fires", "LONG ARM": "forward"}


def _assign_boosters(ordered_roles, pool):
    chosen, used = {}, set()
    for role_name in ordered_roles:
        bias = _ROLE_BIAS.get(role_name, "any")
        pick = None
        for want_strong in (True, False):
            for b in pool.boosters:
                if b["name"] in used:
                    continue
                if b["role_bias"] in (bias, "any") and bool(b.get("strong")) == want_strong:
                    pick = b
                    break
            if pick:
                break
        if not pick:  # nothing matched bias — take any unused
            pick = next((b for b in pool.boosters if b["name"] not in used), None)
        if pick:
            chosen[role_name] = pick["name"]
            used.add(pick["name"])
    return chosen


# ---------------------------------------------------------------- the loop / cadence

_CANON = ["FORWARD EYE", "HARDPOINT", "LONG ARM", "FIRES", "HAMMER"]
_BEAT = {"FORWARD EYE": "Mark", "HARDPOINT": "Set", "FIRES": "Break", "HAMMER": "Hold",
         "LONG ARM": "Hold"}


def _loop(present_role_names):
    order = [r for r in _CANON if r in present_role_names]
    if len(order) < 2:
        return []
    return [(order[i], order[(i + 1) % len(order)]) for i in range(len(order))]


def _cadence(present_role_names):
    return [(_BEAT.get(r, "—"), r) for r in _CANON if r in present_role_names]


# ---------------------------------------------------------------- top level

def resolve_squad(session: Session, players: list, history: dict | None = None) -> Directive:
    history = history or {}
    pool = Pool()

    # fold city terrain into the pressure as an 'urban' situation, and note intel/plotting
    situation_tags = None
    if session.is_city_map:
        situation_tags = ["urban"]
    p = pressure_mod.compose(session.planet_hazards, session.mission_id, session.tactical_objectives)
    if situation_tags:
        extra = pressure_mod.compose(tactical_ids=[]).vector  # noop to keep shape
        urban = pressure_mod.loader.mission_tag_modifiers().get("urban", {}).get("modifiers", {})
        for k, v in urban.items():
            p.vector[k] = round(p.vector.get(k, 0.0) + v, 4)
            p.contributors.setdefault(k, []).append(("city terrain", v))
    session._pressure = p
    session._excluded = set()

    poor_intel = OP_POOR_INTEL in session.operation_modifiers
    chosen = roles_mod.select_roles(p, len(players), poor_intel=poor_intel)
    role_map = _assign_roles(players, chosen, session.mode)

    present_role_names = [roles_mod.ROLES[k].name for k in role_map.values()]
    boosters = _assign_boosters(present_role_names, pool)

    assignments, kits_by_role = [], {}
    squad_used = Counter()

    for pl in players:
        role_key = role_map.get(pl.id)
        if role_key is None:
            continue
        role = roles_mod.ROLES[role_key]
        pstyle = roles_mod.play_style(pl.play_style)
        hist = set(history.get(pl.id, []))
        session._excluded = set(pl.excluded_items or [])

        armor = _pick(pool.armor_of_weight(role.armor_weight), session, pstyle, hist)
        primary = _pick(pool.primaries, session, pstyle, hist, pref_tags=role.primary_pref)
        secondary = _pick(pool.secondaries, session, pstyle, hist)
        grenade = _pick(pool.grenades, session, pstyle, hist,
                        pref_cover=role.grenade_cover, cover_weight=0.9)
        strat = _fill_stratagems(role, pool, session, pstyle, hist, squad_used)

        # armor counts toward coverage (Scout armour is a break-contact answer)
        kit = [primary, secondary, grenade, armor] + strat
        for it in strat:
            squad_used[it.name] += 1
        kits_by_role[role.name] = kit
        assignments.append((pl, role, pstyle, primary, secondary, grenade, armor, strat))

    # coverage pass + rationale
    matrix = coverage.capability_matrix(kits_by_role)
    final = []
    for pl, role, pstyle, primary, secondary, grenade, armor, strat in assignments:
        kit = [primary, secondary, grenade, armor] + strat
        thin = coverage.thin_axes(kit)
        growth = _growth_pick(strat, pstyle, session)
        rationale = _rationale(role, pstyle, session, growth, thin, matrix)
        final.append(Assignment(
            player_id=pl.id, callsign=pl.callsign, role=role.name,
            primary=primary.name, secondary=secondary.name, grenade=grenade.name,
            armor=armor.name, armor_weight=armor.weight, armor_passive=armor.passive,
            booster=boosters.get(role.name, ""),
            stratagems=[s.name for s in strat], growth_slot=growth,
            thin=[coverage.AXIS_LABEL[a] for a in thin], rationale=rationale,
        ))

    reactive = next((r.name for k, r in
                     ((k, roles_mod.ROLES[k]) for k in role_map.values()) if r.reactive), None)
    notes = _notes(session, p)

    return Directive(
        session=session, pressure=p, assignments=final,
        capability_matrix=matrix, loop=_loop(list(kits_by_role.keys())),
        cadence=_cadence(list(kits_by_role.keys())), reactive_role=reactive, notes=notes,
    )


def _rationale(role, pstyle, session, growth, thin, matrix):
    parts = [role.blurb]
    driver = session._pressure.driver()
    if driver:
        parts.append(f"The read is {driver}.")
    if growth:
        parts.append(f"{growth} is the growth pick — outside {pstyle.label}'s usual reach, "
                     f"placed where the mission rewards it, not as a handicap.")
    for a in thin:
        owner = coverage.cover_owner(a, matrix, role.name)
        if owner:
            parts.append(f"{coverage.AXIS_LABEL[a].capitalize()} is thin — {owner} is deep there and covers it.")
    return " ".join(parts)


def _notes(session, p):
    notes = []
    if OP_PLOTTING in session.operation_modifiers:
        notes.append("Complex Stratagem Plotting: every call is 2–4s standing still. Only the "
                     "reactive diver calls under fire; everyone else plots from inside the relay.")
    if OP_POOR_INTEL in session.operation_modifiers:
        notes.append("Poor Intel: the Forward Eye works a beat ahead so objectives are found "
                     "without the squad searching as four.")
    if session.is_city_map:
        notes.append("City map: short sightlines and airborne threats. Emplacements lose arcs; "
                     "anti-air and entry tools gain value.")
    if p.mandates:
        notes.append("Mandated by the map: " + ", ".join(p.mandates) + ".")
    notes.append("Recovery: never reinforce into contact; resume from the last completed beat; "
                 "if the load-bearing asset dies, the sequence stops until it is back.")
    return notes
