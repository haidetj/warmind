"""The squad resolver.

Given a session (planet + mission + difficulty + faction + mode + overlays) and a
set of players (each with a read play-style), produce one assignment per player:
a role, a full kit filled by the scoring function, a growth pick, and a rationale.
Then the squad-level brief: capability matrix, interlock loop, boosters, cadence.

Deterministic. No RNG — same inputs (including the reroll seed) give the same
directive, which is what lets the AAR grade the advice later.
"""

from __future__ import annotations

import itertools
import zlib
from collections import Counter
from dataclasses import dataclass, field

from . import coverage, items as items_mod, kitrules, loader as loader_mod, modes, passives, pressure as pressure_mod, roles as roles_mod, scoring
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
    seed: int = 0  # creator's reroll counter; 0 = the canonical (best-scoring) loadouts


@dataclass
class Player:
    id: str
    callsign: str
    play_style: str = "by_the_book"
    unlocked_warbonds: list = field(default_factory=list)
    excluded_items: list = field(default_factory=list)
    owned_items: list | None = None  # non-base gear this diver owns; None = owns everything
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
    rationale_parts: list = field(default_factory=list)  # [{"k","p"}] — same text, translatable


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
    swaps: list = field(default_factory=list)
    doctrine: dict | None = None  # mission-type doctrine card (e.g. Commando), or None
    notes_i18n: list = field(default_factory=list)  # [{"k","p"}] parallel to notes
    review: list = field(default_factory=list)  # squad redundancy/impact review: [{"k","p","rule","status"}]


# ---------------------------------------------------------------- kit filling

def _pick(cands, session, pstyle, history, *, pref_tags=frozenset(), pref_cover=None,
          cover_weight=0.3, exclude=frozenset(), squad_used=None, extra=None):
    """Highest-scoring item, with soft role preferences and a squad-duplicate penalty."""
    squad_used = squad_used or Counter()
    excl_owned = session_excluded(session)
    best, best_s = None, float("-inf")
    fb, fb_s = None, float("-inf")  # fallback ignoring ownership, so a slot never strands
    for it in cands:
        if it.name in exclude:  # hard excludes (squad dupes, explicit) always hold
            continue
        s = scoring.score(it, session._pressure, session.faction, pstyle, history, session.mode)
        s += 0.4 * len(it.tags & pref_tags)
        if pref_cover and pref_cover in it.coverage:
            s += cover_weight
        if extra:
            s += extra(it)
        s -= 0.5 * squad_used.get(it.name, 0)  # duplicates across the squad are redundancy
        if it.name in kitrules.BUDDY_RELOAD and getattr(session, "_squad_n", 4) <= 3:
            s -= 0.4  # small squads: prefer anti-tank that doesn't need a loader
        if session.seed:  # reroll: reshuffle near-ties only, never promote a clearly worse pick
            s += _jitter(it.name, session.seed, getattr(session, "_salt", ""))
        if s > fb_s:
            fb, fb_s = it, s
        if it.name in excl_owned:  # ownership exclusion is soft
            continue
        if s > best_s:
            best, best_s = it, s
    return best if best is not None else fb


def _jitter(name: str, seed: int, salt: str) -> float:
    """Stable pseudo-random nudge in [0, REROLL_SPREAD) per (item, seed, diver)."""
    h = zlib.crc32(f"{seed}|{salt}|{name}".encode())
    return REROLL_SPREAD * (h % 10_000) / 10_000


REROLL_SPREAD = 0.3  # under one grade step: rerolls swap near-equal options only


def session_excluded(session) -> set:
    return getattr(session, "_excluded", set())


# Commando Operations: stratagems only in two 60s Super Destroyer windows, so every
# role carries the research-backed commando kit — one support weapon (called once,
# carried all mission), one backpack, and two one-shot strikes (one per window).
# No statics: they can't be re-called and they're loud. Pressure still picks which.
COMMANDO_SLOTS = ({"support"}, {"backpack"}, {"orbital", "eagle"}, {"orbital", "eagle"})
_STATIC = {"sentry", "emplacement", "relay", "mine"}


def _fill_stratagems(role, pool, session, pstyle, history, squad_used, slots=None, no_static=False):
    """Fill the role's four stratagem slots under the kit rules (kitrules.diver_allows):
    one held support weapon (+ one expendable beside it), one backpack-slot item, the
    Eagle cap, a cap on statics. Squad-level redundancy (duplicate support weapons, a
    second Supply Pack) is excluded outright; other duplicates are penalised in _pick."""
    picks = []
    squad_names = {n for n, c in squad_used.items() if c > 0}

    def legal(cands, squad_rule=True):
        return [c for c in cands if c.name not in {p.name for p in picks}
                and kitrules.diver_allows(c, picks, role.name, no_static)
                and not (squad_rule and kitrules.squad_excludes(c, squad_names, session))]

    for slot in (slots or role.slots):
        choice = _pick(legal(pool.stratagems_in(slot)), session, pstyle, history, squad_used=squad_used)
        if choice is None:  # slot categories exhausted under the rules — widen to anything legal
            choice = _pick(legal([s for s in pool.stratagems if s.category != "vehicle"]),
                           session, pstyle, history, squad_used=squad_used)
        if choice is None:  # pool exhausted (tiny ownership lists): a duplicate beats an empty slot
            choice = _pick(legal([s for s in pool.stratagems if s.category != "vehicle"], squad_rule=False),
                           session, pstyle, history, squad_used=squad_used)
        if choice is None:
            continue
        picks.append(choice)
    return picks


def _growth_pick(strat_items, pstyle, session):
    """The strongest pick that sits OUTSIDE the player's comfort — the one unfamiliar
    element the coach deliberately exposes. None if nothing is off-comfort (fun mode
    expresses novelty differently and skips this)."""
    if session.mode in ("fun", "optimize"):  # optimize: no deliberate stretch on a must-win drop
        return None
    off = [s for s in strat_items if not (s.tags & pstyle.signature)]
    if not off:
        return None
    return max(off, key=lambda s: scoring.pressure_dot(s, session._pressure)).name


# ---------------------------------------------------------------- role assignment

def _assign_roles(players, chosen_roles, mode):
    """Optimal player->role matching against a FIXED role set, for the mode.
    improvement aligns to affinity, challenge maximises distance from it. Used when
    the caller already decided which roles to field."""
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


def _assign_roles_by_fit(players, mode):
    """Stats-first: give each diver the role their read play-style fits best for the
    mode (improvement = comfort, challenge = stretch, fun = comfort tiebreak), with
    roles kept distinct. Picks the best N of the five roles; mission coverage is a
    separate advisory (see _coverage_swaps), not a constraint here. N<=5, brute force."""
    role_keys = list(roles_mod.ROLES.keys())
    n = len(players)
    best_perm, best_obj = None, float("-inf")
    for perm in itertools.permutations(role_keys, n):
        obj = 0.0
        for pi, role_key in enumerate(perm):
            pstyle = roles_mod.play_style(players[pi].play_style)
            aff = pstyle.affinity.get(role_key, 0.3)
            obj += modes.role_objective(aff, mode) + 1e-3 * aff
        if obj > best_obj:
            best_obj, best_perm = obj, perm
    return {players[pi].id: role_key for pi, role_key in enumerate(best_perm or role_keys[:n])}


def _coverage_swaps(role_map, players, mission_ideal, mode):
    """After stats-first assignment, suggest role swaps that better satisfy the
    mission. mission_ideal is the mission-driven role priority (roles.select_roles).
    Each suggestion moves one diver off a role the mission doesn't need onto one it
    does, choosing the diver whose affinity cost is lowest."""
    assigned = set(role_map.values())
    pid_by_role = {rk: pid for pid, rk in role_map.items()}
    style_by_pid = {p.id: p.play_style for p in players}
    call_by_pid = {p.id: p.callsign for p in players}
    missing = [r for r in mission_ideal if r not in assigned]
    surplus = [r for r in role_map.values() if r not in mission_ideal]
    swaps, used = [], set()
    for want in missing:
        best = None  # (cost, pid, current_role)
        for cur in surplus:
            pid = pid_by_role.get(cur)
            if pid is None or pid in used:
                continue
            aff = roles_mod.play_style(style_by_pid[pid]).affinity
            cost = aff.get(cur, 0.3) - aff.get(want, 0.3)
            if best is None or cost < best[0]:
                best = (cost, pid, cur)
        if best is None:
            continue
        _, pid, cur = best
        used.add(pid)
        swaps.append({
            "player_id": pid, "callsign": call_by_pid[pid],
            "from_role": roles_mod.ROLES[cur].name, "to_role": roles_mod.ROLES[want].name,
            "why": f"The mission calls for a {roles_mod.ROLES[want].name}; "
                   f"{call_by_pid[pid]} is the lowest-cost swap from {roles_mod.ROLES[cur].name}.",
        })
    return swaps


# ---------------------------------------------------------------- boosters

_ROLE_BIAS = {"HARDPOINT": "hardpoint", "HAMMER": "hammer", "FORWARD EYE": "forward",
              "FIRES": "fires", "LONG ARM": "forward"}


def _assign_boosters(divers, pool):
    """divers: [(role_name, excluded_names)] in role order. In the game every diver
    brings a booster from THEIR OWN unlocks, and duplicates don't stack — so each
    diver gets a unique booster they own, preferring the strong picks and their role's
    bias. Base boosters are always owned, so a slot never strands."""
    chosen, used = {}, set()
    for role_name, excluded in divers:
        avail = [b for b in pool.boosters if b["name"] not in excluded and b["name"] not in used]
        bias = _ROLE_BIAS.get(role_name, "any")
        pick = None
        for want_strong in (True, False):
            pick = next((b for b in avail if b["role_bias"] in (bias, "any")
                         and bool(b.get("strong")) == want_strong), None)
            if pick:
                break
        pick = pick or (avail[0] if avail else None)  # nothing matched bias — any unused one they own
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
    if session.mode == "d100":  # the map's demands, turned up past the difficulty dial
        p.vector = {k: round(v * modes.D100_PRESSURE, 4) for k, v in p.vector.items()}
    session._pressure = p
    session._excluded = set()
    doctrine = _doctrine(session)
    commando = bool(doctrine and doctrine.get("kind") == "commando")

    poor_intel = OP_POOR_INTEL in session.operation_modifiers
    # Stats-first: each diver gets the role that fits them. Mission coverage becomes
    # a set of suggested swaps the squad can opt into once everyone's confirmed.
    mission_ideal = roles_mod.select_roles(p, len(players), poor_intel=poor_intel)
    if session.mode == "optimize":
        # the mission's ideal roles, each on the diver who fits it best — swaps already applied
        role_map = _assign_roles(players, mission_ideal, "optimize")
        swaps = []
    else:
        role_map = _assign_roles_by_fit(players, session.mode)
        swaps = _coverage_swaps(role_map, players, mission_ideal, session.mode)

    # Ownership: a diver's own equip slots are limited to the gear they own; boosters
    # are limited to what the diver carrying them owns.
    wb_of = loader_mod.warbond_catalog()["map"]
    gated = {n for n, wb in wb_of.items() if not items_mod.is_base_warbond(wb)}

    def _diver_excluded(pl):
        if pl.owned_items is None:
            return set(pl.excluded_items or [])
        return set(pl.excluded_items or []) | (gated - set(pl.owned_items))

    # boosters: each diver from their own unlocks (not "someone in the squad owns it")
    order = [(roles_mod.ROLES[role_map[pl.id]].name, _diver_excluded(pl)) for pl in players if pl.id in role_map]
    boosters = _assign_boosters(order, pool)

    assignments, kits_by_role = [], {}
    squad_used = Counter()

    session._squad_n = len(players)
    ctx = {}   # pid -> (pl, role, pstyle, hist, excluded)

    def as_diver(pl):
        session._excluded = ctx[pl.id][4]
        session._salt = pl.id

    # phase 1 — armour + stratagems for every diver, under the kit rules
    phase = []
    for pl in players:
        role_key = role_map.get(pl.id)
        if role_key is None:
            continue
        role = roles_mod.ROLES[role_key]
        pstyle = roles_mod.play_style(pl.play_style)
        hist = set(history.get(pl.id, []))
        ctx[pl.id] = (pl, role, pstyle, hist, _diver_excluded(pl))
        as_diver(pl)
        strat = _fill_stratagems(role, pool, session, pstyle, hist, squad_used,
                                 slots=COMMANDO_SLOTS if commando else None, no_static=commando)
        for it in strat:
            squad_used[it.name] += 1
        phase.append({"pid": pl.id, "callsign": pl.callsign, "role": role.name, "strat": strat})

    # phase 2 — squad review: redundancy + coverage floors (anti-tank depth, chaff, structures)
    def review_pick(kit, cands):
        pl, role, pstyle, hist, _ = ctx[kit["pid"]]
        as_diver(pl)
        return _pick(cands, session, pstyle, hist, squad_used=squad_used)
    review = kitrules.review_squad(phase, pool, review_pick, session, commando)

    passive_why = {}
    # phase 3 — carried weapons complement the final stratagems: an anti-tank support
    # weapon wants a chaff primary; no anti-tank support means the grenade brings it
    for kit in phase:
        pl, role, pstyle, hist, _ = ctx[kit["pid"]]
        as_diver(pl)
        strat = kit["strat"]
        main = kitrules.main_support(strat)
        has_at = bool(main and "at" in main.coverage) or any("at" in s.coverage for s in strat if s.category == "support")
        primary = _pick(pool.primaries, session, pstyle, hist, pref_tags=role.primary_pref,
                        pref_cover="ch" if has_at else None, cover_weight=0.4)
        secondary = _pick(pool.secondaries, session, pstyle, hist)
        grenade = _pick(pool.grenades, session, pstyle, hist,
                        pref_cover=role.grenade_cover if has_at else "at", cover_weight=0.9)
        # phase 4 — armour last, so its passive can answer the finished kit
        # (Inflammable with fire, Gunslinger with a strong sidearm, True Grit with a backpack gun…)
        weight = "Medium" if commando and role.armor_weight == "Heavy" else role.armor_weight  # commando: no Heavy
        pk = {"primary": primary, "secondary": secondary, "grenade": grenade, "strat": strat}
        # armour's value is mostly its passive: let mission pressure count 40% here so a
        # passive that answers this kit beats one that merely shares a tag with the map
        armor = _pick(pool.armor_of_weight(weight), session, pstyle, hist,
                      extra=lambda a: passives.bonus(a.passive, pk, session.faction)[0]
                      - ARMOR_PRESSURE_DISCOUNT * scoring.pressure_dot(a, session._pressure))
        passive_why[pl.id] = passives.bonus(armor.passive, pk, session.faction)[1]
        # armor counts toward coverage (Scout armour is a break-contact answer)
        kits_by_role[role.name] = [primary, secondary, grenade, armor] + strat
        assignments.append((pl, role, pstyle, primary, secondary, grenade, armor, strat))

    # coverage pass + rationale
    matrix = coverage.capability_matrix(kits_by_role)
    final = []
    for pl, role, pstyle, primary, secondary, grenade, armor, strat in assignments:
        kit = [primary, secondary, grenade, armor] + strat
        thin = coverage.thin_axes(kit)
        growth = _growth_pick(strat, pstyle, session)
        rationale, rparts = _rationale(role, pstyle, session, growth, thin, matrix, style_key=pl.play_style)
        if passive_why.get(pl.id):
            why = passive_why[pl.id][0]
            rationale += f" {armor.name}'s {armor.passive} passive suits this kit ({PASSIVE_WHY_EN.get(why, why)})."
            rparts.append({"k": "rat.passive", "p": {"armor": armor.name, "passive": armor.passive, "why": why}})
        if commando:
            rationale += (" Commando op: no statics — carry your support weapon, keep one strike "
                          "for each Super Destroyer window.")
            rparts.append({"k": "rat.commando", "p": {}})
        final.append(Assignment(
            player_id=pl.id, callsign=pl.callsign, role=role.name,
            primary=primary.name, secondary=secondary.name, grenade=grenade.name,
            armor=armor.name, armor_weight=armor.weight, armor_passive=armor.passive,
            booster=boosters.get(role.name, ""),
            stratagems=[s.name for s in strat], growth_slot=growth,
            thin=[coverage.AXIS_LABEL[a] for a in thin], rationale=rationale, rationale_parts=rparts,
        ))

    reactive = next((r.name for k, r in
                     ((k, roles_mod.ROLES[k]) for k in role_map.values()) if r.reactive), None)
    note_phrases = _notes(session, p)
    notes = [n["t"] for n in note_phrases]

    return Directive(
        session=session, pressure=p, assignments=final,
        capability_matrix=matrix, loop=_loop(list(kits_by_role.keys())),
        cadence=_cadence(list(kits_by_role.keys())), reactive_role=reactive, notes=notes,
        swaps=swaps, doctrine=doctrine, review=review,
        notes_i18n=[{"k": n["k"], "p": n["p"]} for n in note_phrases],
    )


ARMOR_PRESSURE_DISCOUNT = 0.6

PASSIVE_WHY_EN = {
    "pw.secondary": "faster, steadier sidearm", "pw.primary_reload": "faster primary reloads",
    "pw.ammo": "more ammo and faster reloads for an ammo-hungry primary", "pw.support_reload": "faster support-weapon reloads",
    "pw.handling": "less drag on a heavy weapon", "pw.melee": "harder melee hits", "pw.throwables": "two extra throwables",
    "pw.throw_range": "longer throws for grenades and beacons", "pw.fire": "shrugs off your own fire",
    "pw.gas": "shrugs off your own gas", "pw.arc": "shrugs off arc splash", "pw.elemental": "resists your own fire, gas and arc",
    "pw.explosive": "halves explosive damage from bot rockets", "pw.recoil": "less recoil when braced",
    "pw.sway": "steadier aim for the marksman rifle", "pw.flinch": "no flinch while holding a sightline",
    "pw.stealth": "harder to spot while picking targets",
}


def _role_key(role) -> str:
    return role.name.replace(" ", "_")


def _rationale(role, pstyle, session, growth, thin, matrix, style_key=""):
    """English rationale text plus the same thing as translatable phrases."""
    parts, phrases = [role.blurb], [{"k": f"role.{_role_key(role)}.blurb", "p": {}}]
    driver = session._pressure.driver()
    if driver:
        parts.append(f"The read is {driver}.")
        phrases.append({"k": "rat.read", "p": {"driver": driver}})
    if growth:
        parts.append(f"{growth} is the growth pick — outside {pstyle.label}'s usual reach, "
                     f"placed where the mission rewards it, not as a handicap.")
        phrases.append({"k": "rat.growth", "p": {"item": growth, "style": style_key}})
    for a in thin:
        owner = coverage.cover_owner(a, matrix, role.name)
        if owner:
            parts.append(f"{coverage.AXIS_LABEL[a].capitalize()} is thin — {owner} is deep there and covers it.")
            phrases.append({"k": "rat.thin", "p": {"axis": a, "owner": owner}})
    return " ".join(parts), phrases


COMMANDO_ORDERS = (
    "Two Super Destroyer windows, 60 seconds each — plan every call before the first one. "
    "Window one: the kit you'll carry all mission. Window two: the main objective or extraction.",
    "Persistent kit first (support weapons, backpacks). A dead diver drops theirs — recover it; "
    "there is no re-call until the next window.",
    "Threat rises for good with every bot drop. Kill flares and callers first, go around patrols, "
    "and don't fight for samples.",
    "Reinforcement is from the 4 pods (3 lives each) — 12 for the whole squad. Mark them on drop.",
)


def _doctrine(session) -> dict | None:
    tags = (loader_mod.missions().get(session.mission_id) or {}).get("tags") or []
    if "commando_op" in tags:
        # client translates title/orders by `kind` (doctrine.commando.title, .1 … .4)
        return {"kind": "commando", "title": "Commando doctrine", "orders": list(COMMANDO_ORDERS)}
    return None


D100_ORDERS = (
    "D100 standing order: no resupply calls until the primary objective is complete.",
    "D100 standing order: reinforce only from extraction range — every death costs the squad ground.",
    "D100 standing order: no S-tier crutches. The kit is off-meta on purpose; make it work.",
)


def _notes(session, p):
    """Field notes as [{"k", "p", "t"}]: a translation key + params, and the English text."""
    notes = []
    add = lambda k, t, **pp: notes.append({"k": k, "p": pp, "t": t})
    if session.mode == "d100":
        for i, t in enumerate(D100_ORDERS, 1):
            add(f"d100.{i}", t)
    if OP_PLOTTING in session.operation_modifiers:
        add("note.plotting", "Complex Stratagem Plotting: every call is 2–4s standing still. Only the "
                             "reactive diver calls under fire; everyone else plots from inside the relay.")
    if OP_POOR_INTEL in session.operation_modifiers:
        add("note.poor_intel", "Poor Intel: the Forward Eye works a beat ahead so objectives are found "
                               "without the squad searching as four.")
    if session.is_city_map:
        add("note.city", "City map: short sightlines and airborne threats. Emplacements lose arcs; "
                         "anti-air and entry tools gain value.")
    if p.mandates:
        add("note.mandated", "Mandated by the map: " + ", ".join(p.mandates) + ".", list=", ".join(p.mandates))
    add("note.recovery", "Recovery: never reinforce into contact; resume from the last completed beat; "
                         "if the load-bearing asset dies, the sequence stops until it is back.")
    return notes
