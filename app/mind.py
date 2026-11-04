"""WARMIND thinks: one Claude call that plans the squad's loadouts with everything we know.

The rules engine (warmind.resolve) is fast and always right about the rules, but it
weighs a fixed set of terms. The planner hands Claude the whole picture: the mission,
hazards, operation modifiers, tactical objectives and oaths; the mode; each diver's
career rates, play style and the role the engine gave them; and, per diver and slot, a
shortlist of gear they own, already filtered and ranked by the engine, with tags,
coverage, wiki stats and what each item asks of the player. Claude picks the kits and
says why, one line per decision, in the squad's language.

Nothing Claude says is trusted blindly. Every pick goes back through the engine
(resolve_squad(override=...)): a name the diver doesn't own, a slot it doesn't fit or
a kit-rule break is dropped and the engine fills that slot; the squad review still
enforces the anti-tank, chaff and structure floors. A "why" line naming gear that isn't
in the final kit is dropped too.

Cost: one call per distinct set of inputs (a reroll or a mission change is a new set),
cached in the database, capped by budget.charge_plan. About 8-12k tokens in and 2-4k
out (thinking included): roughly $0.04-0.07 on Sonnet 5 at $2 / $10 per million.
"""

from __future__ import annotations

import copy
import difflib
import hashlib
import json
import os
import threading
import time

import httpx

import budget
import db
import vision
from warmind import ask as ask_mod, handling, kitrules, loader, modes, oaths, roles as roles_mod, scoring
from warmind.items import Pool
from warmind.resolve import COMMANDO_SLOTS, diver_excluded, resolve_squad

ENABLED = os.environ.get("WARMIND_PLANNER", "1") != "0"
MODEL = os.environ.get("WARMIND_PLAN_MODEL", vision.MODEL)
EFFORT = os.environ.get("WARMIND_PLAN_EFFORT", "medium")
TIMEOUT_S = 150
STALE_S = 240          # an in-flight plan older than this is presumed lost (restart, crash)

N_PRIMARY, N_SECONDARY, N_GRENADE, N_ARMOR, N_STRAT = 10, 6, 6, 9, 24

_lock = threading.Lock()
_inflight: dict = {}   # (lobby_id, sig) -> started_at
LAST: dict = {}        # the most recent plan's outcome, for /health (no lobby data)

MODE_MEANING = {
    "optimize": "Win this drop. The strongest kit for the mission, on gear the diver knows; no deliberate stretch.",
    "fun": "Fresh and fun: favour gear the diver hasn't been running, as long as it still answers the mission.",
    "improvement": "Grow the diver: kit inside their strengths, plus exactly one unfamiliar element worth learning.",
    "challenge": "Make it genuinely hard to play WELL, while still answering the mission. Push the diver off their "
                 "comfort zone and onto high-ask gear (precision, timing, reload discipline, no crutches), and "
                 "aim it at the weak spots their stats show. A challenge kit is harder, never hopeless: the squad "
                 "must still be able to kill heavies, clear chaff and destroy objectives.",
    "d100": "Helldive∞: the hardest version of this mission. Off-meta, high-ask kit, no crutches at all, the map's "
            "demands turned up. Brutal, still mission-capable.",
}

AXES = {"at": "anti-tank (kills heavies)", "st": "structures (destroys fabricators, nests, objectives)",
        "ch": "chaff (clears hordes of small enemies)", "bc": "break contact (gets the diver out of trouble)"}

DRILL_MEANING = {
    "survive": "dies a lot: take away the safety net (shield packs, dogs, Heavy armour, crutch gear)",
    "tidy": "rarely dies: glass cannon (lighter armour, no safety net)",
    "eagles": "leans on Eagles: make them use orbitals / their own guns instead",
    "orbitals": "leans on orbitals: make them use Eagles / their own guns instead",
    "turrets": "lives behind sentries: no statics, hold ground with their own weapon",
    "clean": "kills teammates: precision over splash, no danger-close kit",
}


# ---------------------------------------------------------------- signature

def signature(session, players, mission: dict) -> str:
    """One hash per distinct set of planner inputs."""
    body = {
        "m": {k: v for k, v in sorted(mission.items()) if k not in ("think",)},
        "seed": session.seed,
        "p": [[p.id, p.play_style, sorted(p.owned_items) if p.owned_items is not None else None,
               round(p.accuracy, 3) if p.accuracy is not None else None,
               {k: round(v, 3) for k, v in (p.derived or {}).items()}, sorted(p.excluded_items or []),
               [f.get("name") for f in (p.favorites or [])]]
              for p in players],
        "v": 1,
    }
    return hashlib.sha1(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[:20]


# ---------------------------------------------------------------- the brief

def _stats_line(name: str) -> str:
    st = (loader.armory_meta().get(name) or {}).get("stats") or {}
    keys = [("damage", "dmg"), ("rpm", "rpm"), ("capacity", "mag"), ("recoil", "recoil"), ("reload", "reload s")]
    return " ".join(f"{lab} {st[k]}" for k, lab in keys if isinstance(st.get(k), (int, float)))


def _item_line(it, score: float) -> str:
    v, reason = ask_mod.ask(it)
    bits = [it.name]
    if it.slot == "stratagem":
        bits.append(it.category + (" backpack" if it.backpack else "") + (" expendable" if it.expendable else ""))
    if it.slot == "armor":
        bits.append(f"{it.weight}, passive {it.passive}")
    if it.coverage:
        bits.append("covers " + ",".join(sorted(it.coverage)))
    if it.tags:
        bits.append("tags " + ",".join(sorted(it.tags)))
    if it.slot in ("primary", "secondary", "stratagem"):
        s = _stats_line(it.name)
        if s:
            bits.append(s)
    if v is not None:
        bits.append(f"ask {v:.2f}" + (f" ({reason})" if reason else ""))
    bits.append(f"engine {score:+.2f}")
    return " | ".join(bits)


def _shortlists(session, players, directive) -> dict:
    """Per diver, per slot: owned options, ranked by the engine (its pick always included)."""
    pool = Pool()
    by_pid = {a.player_id: a for a in directive.assignments}
    quiet = bool(session.stealth or (directive.doctrine and directive.doctrine.get("kind") == "commando"))
    out = {}
    for pl in players:
        a = by_pid.get(pl.id)
        if a is None:
            continue
        excl = diver_excluded(pl)
        session._excluded, session._salt = excl, pl.id
        session._sk = handling.skill(pl.accuracy)
        session._drills = ask_mod.drills(pl.derived, session.mode)
        pstyle = roles_mod.play_style(pl.play_style)

        def sc(it):
            s = scoring.score(it, session._pressure, session.faction, pstyle, set(), session.mode)
            if it.slot in ("primary", "secondary"):
                s += handling.fit(it.name, session._sk, session.mode)
                if session._sk is None:
                    s += ask_mod.ask_term(it, session.mode)
            else:
                s += ask_mod.ask_term(it, session.mode)
            return s + ask_mod.drill_term(it, session._drills)

        def top(cands, n, must=()):
            owned = [c for c in cands if c.name not in excl]
            ranked = sorted(((sc(c), c) for c in owned), key=lambda x: -x[0])
            keep = ranked[:n]
            for name in must:
                if name and all(c.name != name for _, c in keep):
                    keep += [(s, c) for s, c in ranked if c.name == name]
            return keep

        armor_cands = [x for x in pool.armor if not (quiet and x.weight == "Heavy")]
        arm = []
        for w in ("Light", "Medium", "Heavy"):
            arm += top([x for x in armor_cands if x.weight == w], 3)
        if all(c.name != a.armor for _, c in arm):
            arm += top([x for x in armor_cands if x.name == a.armor], 1)
        strat_cands = [s for s in pool.stratagems if s.category != "vehicle"
                       and not (quiet and s.category in kitrules.STATIC)]
        out[pl.id] = {
            "primary": top(pool.primaries, N_PRIMARY, [a.primary]),
            "secondary": top(pool.secondaries, N_SECONDARY, [a.secondary]),
            "grenade": top(pool.grenades, N_GRENADE, [a.grenade]),
            "armor": arm,
            "stratagems": top(strat_cands, N_STRAT, a.stratagems),
            "boosters": [b for b in pool.boosters if b["name"] not in excl],
            "drills": session._drills,
        }
    return out


def _system_prompt() -> str:
    roles = "\n".join(f"- {k}: {r.blurb} Armour {r.armor_weight}. Usual stratagem slots: "
                      + "; ".join("/".join(sorted(sl)) for sl in r.slots) + "."
                      for k, r in roles_mod.ROLES.items())
    rules = "\n".join(f"- {r['rule'].strip()}" for r in loader._load("kit_rules.yaml")["rules"])
    mode_txt = "\n".join(f"- {k}: {v}" for k, v in MODE_MEANING.items())
    axes = "\n".join(f"- {k}: {v}" for k, v in AXES.items())
    drills = "\n".join(f"- {k}: {v}" for k, v in DRILL_MEANING.items())
    return f"""You are WARMIND, the squad coach in a Helldivers 2 companion app used by one friend group. \
Before a drop you plan every diver's loadout: role, primary, secondary, grenade, armour, booster and four \
stratagems. A deterministic engine has already made a plan; you see its picks and its ranked shortlists of \
gear each diver OWNS. Improve on it with judgement the engine can't make: how the kits work together, what \
this mission really needs, and what this particular diver's numbers say about them.

Modes (the squad picked one):
{mode_txt}

Roles (each diver gets a different one):
{roles}

Coverage axes:
{axes}

Kit rules (the game's, enforced after you answer; a pick that breaks one is replaced by the engine's):
{rules}

"ask" is how much an item demands of the player, 0 = forgiving (covers mistakes) to 1 = punishing (only \
pays off when played well). Weapons are rated from wiki recoil / rate of fire / magazine. "engine" is the \
engine's score for that diver in this mode (higher = the engine likes it more); use it as a hint, not a rule.

Drills (Challenge / D100 only) are habits the engine read from the diver's career stats:
{drills}

How to answer:
- Use ONLY item names that appear in that diver's own lists, copied exactly. Never invent gear.
- saved_loadouts are kits a diver kept for reference: lean towards their picks when they fit the mission \
and mode (in Challenge / D100, use them to see the comfort zone to push off).
- Keep each diver's engine_plan role when role_locked is true (the squad leader chose it).
- Exactly four stratagems per diver, obeying the kit rules (one held support weapon, one backpack item, ...).
- Across the squad: at least two divers who can kill heavies with their support weapon, at least one \
anti-tank strike, enough chaff and structure coverage, no duplicated support weapons, one Supply Pack at most.
- Give each diver 2-4 "why" lines, second person, specific: tie a pick to the mission, a hazard or modifier, \
the diver's own numbers, or a squadmate's kit. No filler, no restating the item list. Each line under 160 \
characters. In Challenge / D100, say what the hard pick asks of them.
- "summary": one or two sentences on how the squad's kits fit together for this drop.
- Write the why lines and summary in the language you're told. Keep official game names (items, \
stratagems, missions, roles) in English.
- Item names inside why lines must be exact names from the lists."""


def _mission_block(session, mission: dict, directive) -> dict:
    m = loader.missions().get(session.mission_id, {})
    hz = loader.hazards()
    om = loader.operation_modifiers()
    tac = loader.tactical_objectives()
    p = directive.pressure
    return {
        "mission": m.get("display_name", session.mission_id), "archetype": m.get("archetype"),
        "mission_tags": m.get("tags", []), "faction": session.faction, "difficulty": session.difficulty,
        "planet": session.planet_name or None,
        "hazards": [f"{hz[h]['display_name']}: {hz[h].get('description', '')}" for h in session.planet_hazards if h in hz],
        "operation_modifiers": [f"{om[x]['display_name']}: {om[x].get('description', '')} {om[x].get('note', '')}".strip()
                                for x in session.operation_modifiers if x in om],
        "tactical_objectives": [tac[t].get("display_name", t) for t in session.tactical_objectives if t in tac],
        "city_map": session.is_city_map, "stealth_run": session.stealth,
        "oaths": [f"{oaths.OATHS[k]['name']}: {oaths.OATHS[k]['rule']}" for k in (mission.get("oaths") or []) if k in oaths.OATHS],
        "mode": session.mode,
        "doctrine": directive.doctrine.get("kind") if directive.doctrine else None,
        "pressure_top": [{"tag": t, "weight": round(v, 2),
                          "from": [f"{lab} {d:+.2f}" for lab, d in p.contributors.get(t, [])][:3]}
                         for t, v in p.top(8)],
        "engine_notes": directive.notes,
    }


def _diver_block(pl, a, sl, locked=False) -> dict:
    d = pl.derived or {}
    pct = lambda k: round(100 * d[k]) if k in d else None
    stats = None
    if pl.accuracy is not None or d:
        stats = {"accuracy_pct": round(100 * pl.accuracy, 1) if pl.accuracy is not None else None,
                 "deaths_per_mission": round(d["deaths_per_mission"], 2) if "deaths_per_mission" in d else None,
                 "kills_per_min": round(d["kills_per_min"], 2) if "kills_per_min" in d else None,
                 "win_rate_pct": pct("win_rate"), "eagle_share_pct": pct("eagle_share"),
                 "orbital_share_pct": pct("orb_share"), "defensive_share_pct": pct("def_share"),
                 "supply_share_pct": pct("supply_share"),
                 "friendly_kills_per_mission": round(d["friendly_per_mission"], 2) if "friendly_per_mission" in d else None}
        stats = {k: v for k, v in stats.items() if v is not None}
    ps = roles_mod.play_style(pl.play_style)
    lines = lambda key: [_item_line(it, s) for s, it in sl[key]]
    return {
        "id": pl.id, "callsign": pl.callsign,
        "play_style": ps.label, "comfort_zone_tags": sorted(ps.signature),
        "career_stats": stats or "no stats uploaded",
        "drills": sl["drills"],
        "role_locked": locked or None,   # the squad leader set this role: keep it
        "saved_loadouts": pl.favorites or None,   # kits this diver saved in their locker: a hint at what they like
        "engine_plan": {"role": a.role.replace(" ", "_"), "primary": a.primary, "secondary": a.secondary,
                        "grenade": a.grenade, "armor": f"{a.armor} ({a.armor_weight}, {a.armor_passive})",
                        "booster": a.booster, "stratagems": a.stratagems},
        "options": {
            "primary": lines("primary"), "secondary": lines("secondary"), "grenade": lines("grenade"),
            "armor": lines("armor"), "stratagems": lines("stratagems"),
            "booster": [f"{b['name']}: {b.get('effect', '')}" for b in sl["boosters"]],
        },
    }


SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["summary", "divers"],
    "properties": {
        "summary": {"type": "string"},
        "divers": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "role", "primary", "secondary", "grenade", "armor", "booster", "stratagems", "why"],
            "properties": {
                "id": {"type": "string"},
                "role": {"type": "string", "enum": list(roles_mod.ROLES.keys())},
                "primary": {"type": "string"}, "secondary": {"type": "string"},
                "grenade": {"type": "string"}, "armor": {"type": "string"}, "booster": {"type": "string"},
                "stratagems": {"type": "array", "items": {"type": "string"}},
                "why": {"type": "array", "items": {"type": "string"}},
            }}},
    },
}


def build_request(session, players, mission, directive, lang: str) -> tuple[str, str, dict]:
    sl = _shortlists(session, players, directive)
    by_pid = {a.player_id: a for a in directive.assignments}
    brief = {
        "language": vision.LANG_NAMES.get(lang, "English"),
        "drop": _mission_block(session, mission, directive),
        "squad": [_diver_block(pl, by_pid[pl.id], sl[pl.id], pl.id in (session.roles or {})) for pl in players if pl.id in sl],
        "engine_review": [r for r in directive.review if r.get("status") != "ok"] or "all squad checks pass",
    }
    user = ("Plan this squad's loadouts. Answer with the JSON object only.\n\n"
            + json.dumps(brief, ensure_ascii=False, separators=(",", ":")))
    return _system_prompt(), user, sl


# ---------------------------------------------------------------- the call

def _call(system: str, user: str) -> tuple[dict, dict]:
    headers = {"x-api-key": vision.API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    body = {
        "model": MODEL, "max_tokens": 16000,
        # the system prompt is the same for every plan: cache it
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": user}],
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
    }
    with httpx.Client(timeout=TIMEOUT_S) as client:
        r = client.post(f"{vision.BASE_URL}/v1/messages", headers=headers, json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"planner API {r.status_code}: {r.text[:300]}")
        data = r.json()
    if data.get("stop_reason") in ("refusal", "max_tokens"):
        raise RuntimeError(f"planner stopped: {data.get('stop_reason')}")
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return json.loads(text), data.get("usage") or {}


def _mock(players, directive) -> tuple[dict, dict]:
    """No API key: echo the engine's plan with placeholder reasoning, so the flow works offline."""
    time.sleep(1.2)
    by_pid = {a.player_id: a for a in directive.assignments}
    divers = []
    for pl in players:
        a = by_pid.get(pl.id)
        if not a:
            continue
        divers.append({"id": pl.id, "role": a.role.replace(" ", "_"), "primary": a.primary, "secondary": a.secondary,
                       "grenade": a.grenade, "armor": a.armor, "booster": a.booster, "stratagems": a.stratagems,
                       "why": [f"(mock) {a.primary} is the engine's pick; set ANTHROPIC_API_KEY for real reasoning."]})
    return {"summary": "(mock) WARMIND would explain how the four kits interlock here.", "divers": divers}, {}


# ---------------------------------------------------------------- checking the answer

def _match(name, options: list[str]):
    if not isinstance(name, str) or not name.strip():
        return None
    if name in options:
        return name
    low = {o.lower(): o for o in options}
    if name.lower() in low:
        return low[name.lower()]
    close = difflib.get_close_matches(name, options, n=1, cutoff=0.85)
    return close[0] if close else None


def to_override(raw: dict, sl: dict) -> tuple[dict, dict, int]:
    """Planner JSON -> (override for resolve_squad, why lines by pid, names it got wrong)."""
    override, why, bad = {}, {}, 0
    pool = Pool()
    owned_names = {}
    for d in (raw.get("divers") or []):
        pid = d.get("id")
        if pid not in sl:
            continue
        s = sl[pid]
        o = {}
        if d.get("role") in roles_mod.ROLES:
            o["role"] = d["role"]
        for slot in ("primary", "secondary", "grenade", "armor"):
            # any owned item of the slot counts, not only the shortlist (the engine re-checks)
            opts = [c.name for _, c in s[slot]]
            got = _match(d.get(slot), opts)
            if got is None and d.get(slot):
                full = {"primary": pool.primaries, "secondary": pool.secondaries, "grenade": pool.grenades,
                        "armor": pool.armor}[slot]
                got = _match(d.get(slot), [c.name for c in full])
            bad += got is None
            if got:
                o[slot] = got
        strat_opts = [c.name for _, c in s["stratagems"]] + [c.name for c in pool.stratagems]
        names = []
        for n in (d.get("stratagems") or [])[:4]:
            got = _match(n, strat_opts)
            bad += got is None
            if got and got not in names:
                names.append(got)
        o["stratagems"] = names
        b = _match(d.get("booster"), [x["name"] for x in s["boosters"]])
        if b:
            o["booster"] = b
        override[pid] = o
        why[pid] = [str(x).strip()[:220] for x in (d.get("why") or []) if str(x).strip()][:4]
        owned_names[pid] = True
    return override, why, bad


def _kept(final, override) -> tuple[int, int]:
    kept = total = 0
    for a in final.assignments:
        o = override.get(a.player_id) or {}
        for slot in ("primary", "secondary", "grenade", "armor"):
            if o.get(slot):
                total += 1
                kept += getattr(a, slot) == o[slot]
        for n in o.get("stratagems", []):
            total += 1
            kept += n in a.stratagems
    return kept, total


_ALL_NAMES = None


def _clean_why(lines: list[str], a) -> list[str]:
    """Drop a line that names gear the diver isn't carrying (the engine replaced it)."""
    global _ALL_NAMES
    if _ALL_NAMES is None:
        _ALL_NAMES = sorted({it.name for it in Pool().all_items()} | {b["name"] for b in Pool().boosters},
                            key=len, reverse=True)
    carried = {a.primary, a.secondary, a.grenade, a.armor, a.booster, *a.stratagems}
    out = []
    for ln in lines:
        named = [n for n in _ALL_NAMES if n in ln]
        if all(n in carried for n in named):
            out.append(ln)
    return out


# ---------------------------------------------------------------- orchestration

def _think(lobby_id, sig, session, players, mission, lang):
    t0 = time.time()
    try:
        base = resolve_squad(copy.deepcopy(session), copy.deepcopy(players), {})
        system, user, sl = build_request(base.session, players, mission, base, lang)
        if vision.MOCK:
            raw, usage = _mock(players, base)
        else:
            raw, usage = _call(system, user)
        override, why, bad = to_override(raw, sl)
        plan = {"override": override, "why": why, "summary": str(raw.get("summary") or "")[:600],
                "bad_names": bad, "usage": usage, "model": "mock" if vision.MOCK else MODEL,
                "prompt_chars": len(system) + len(user)}
        db.put_plan(lobby_id, sig, "ready", plan)
        LAST.clear(); LAST.update(status="ready", at=round(time.time()), usage=usage, bad_names=bad,
                                  seconds=round(time.time() - t0, 1))
    except Exception as e:   # the engine's plan stands; say why the thinking didn't land
        err = f"{type(e).__name__}: {e}"[:300]
        db.put_plan(lobby_id, sig, "failed", {"error": err})
        LAST.clear(); LAST.update(status="failed", at=round(time.time()), error=err)
    finally:
        with _lock:
            _inflight.pop((lobby_id, sig), None)


def plan_for(lobby_id, session, players, mission: dict) -> tuple[dict | None, dict]:
    """(stored plan or None, status for the client). Starts a think in the background when
    there's no plan for these inputs yet."""
    if not ENABLED or mission.get("think") is False:
        return None, {"status": "off"}
    sig = signature(session, players, mission)
    row = db.get_plan(lobby_id, sig)
    if row and row["status"] == "ready":
        return row["plan"], {"status": "ready", "sig": sig}
    if row and row["status"] == "failed":
        return None, {"status": "failed", "sig": sig}
    now = time.time()
    with _lock:
        started = _inflight.get((lobby_id, sig))
        if started and now - started < STALE_S:
            return None, {"status": "thinking", "sig": sig, "since": started}
        try:
            budget.charge_plan(lobby_id)
        except budget.OverBudget:
            return None, {"status": "budget", "sig": sig}
        _inflight[(lobby_id, sig)] = now
    lang = mission.get("lang") if mission.get("lang") in vision.LANG_NAMES else "en"
    threading.Thread(target=_think, args=(lobby_id, sig, copy.deepcopy(session), copy.deepcopy(players),
                                          dict(mission), lang), daemon=True).start()
    return None, {"status": "thinking", "sig": sig, "since": now}


def apply(session, players, plan: dict):
    """Re-run the engine with the planner's picks, and attach its reasoning."""
    override = plan.get("override") or {}
    d = resolve_squad(session, players, {}, override=override)
    kept, total = _kept(d, override)
    for a in d.assignments:
        lines = _clean_why(plan.get("why", {}).get(a.player_id, []), a)
        if lines:
            keep = [w for w in a.why if w["kind"] in ("role", "drill", "handling", "thin", "nostats", "reroll")]
            a.why = [{"kind": "mind", "k": "why.mind", "p": {"t": ln}} for ln in lines] + keep
    return d, {"summary": plan.get("summary", ""), "kept": kept, "total": total, "model": plan.get("model")}
