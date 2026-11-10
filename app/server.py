"""WARMIND lobby server.

Raw inputs are stored; loadouts are resolved live so every card reflects the current
roster and mission. Screenshot reading is a model call (vision.py); everything else is
the deterministic resolver you can run offline.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import time

from fastapi import FastAPI, Form, Header, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware
import pathlib

import budget
import costs
import db
import vision
import war
from warmind import compass, coverage, kitrules, loader, oaths, passives, stats
from warmind.items import Pool
from warmind.resolve import Player, Session, resolve_squad
import mind

HERE = pathlib.Path(__file__).parent
ACCENTS = ["#d7a53a", "#4c9be0", "#2f9e6f", "#c084e8", "#e0574e"]

app = FastAPI(title="WARMIND")
app.add_middleware(GZipMiddleware, minimum_size=1024)  # i18n.js is ~240KB raw, ~60KB gzipped
db.init()  # idempotent; also covered by the startup hook for reloads


# ---------------------------------------------------------------- helpers
def _id(n=5):
    return secrets.token_hex(n)


def _mission_from(lobby) -> dict | None:
    return json.loads(lobby["mission_json"]) if lobby and lobby["mission_json"] else None


def _owned_from_json(raw) -> list | None:
    """Stored gear -> the full list of items owned, or None meaning 'owns everything'.
    v2 ({"v": 2, "owned": [...]}) lists every owned item, base gear included. The
    original format (a bare list) only listed warbond/Superstore gear, with base and
    requisition gear implied, so it's read with all base gear owned."""
    if not raw:
        return None
    try:
        v = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None
    valid = loader.warbond_catalog()["map"]
    if isinstance(v, dict) and isinstance(v.get("owned"), list):
        return [n for n in v["owned"] if n in valid]
    if isinstance(v, list):
        base = [n for n, wb in valid.items() if loader.is_base(wb)]
        return [n for n in v if n in valid] + [n for n in base if n not in v]
    return None


def _owned_of(p) -> list | None:
    """A player row's owned gear (every owned item), or None meaning 'owns everything'."""
    return _owned_from_json(p.get("owned_json") if isinstance(p, dict) else None)


def _accuracy_of(p) -> float | None:
    """Career accuracy (shots hit / fired) from the diver's stat read, if there is one."""
    try:
        snap = json.loads(p["snapshot_json"]) if p.get("snapshot_json") else None
    except Exception:
        return None
    if not snap or not (snap.get("shots_fired") or 0):
        return None
    return float(snap.get("shots_hit") or 0) / float(snap["shots_fired"])


def _derived_of(p) -> dict | None:
    """Career rates (deaths / mission, Eagle share, ...) from the diver's stat read, if any."""
    try:
        snap = json.loads(p["snapshot_json"]) if p.get("snapshot_json") else None
    except Exception:
        return None
    return stats.derive(snap) if snap and (snap.get("missions_played") or snap.get("total_stratagems")) else None


def _oaths_of(mission) -> list:
    """The mission's oaths (list), reading the single-oath format older lobbies stored."""
    ks = mission.get("oaths") if isinstance(mission.get("oaths"), list) else ([mission["oath"]] if mission.get("oath") else [])
    return [k for k in ks if k in oaths.OATHS]


def _verdicts_of(raw) -> list:
    v = json.loads(raw) if raw else None
    return v if isinstance(v, list) else [v] if v else []


def _owned_store(owned: list | None):
    return None if owned is None else {"v": 2, "owned": owned}


def _style_phrase(p, snap) -> dict:
    """The diver's style note as a translation key + params (the stored English
    style_note stays as the fallback)."""
    src, note = p.get("style_source") or "pending", p.get("style_note") or ""
    if src == "screenshot" and snap:
        return stats.classify_phrase(snap)
    if src == "remembered":
        m = re.search(r"\(([^)]+)\)", note)
        return {"k": "note.restored", "p": {"when": m.group(1) if m else ""}}
    if src == "manual":
        return {"k": "note.chosen", "p": {}}
    if note.startswith("Couldn't read"):
        return {"k": "note.couldnt_read", "p": {}}
    return {"k": "note.pick_style", "p": {}}


def _conf_of(p) -> dict | None:
    """A player row's double-read confidence {verified, uncertain}, or None."""
    raw = p.get("confidence_json") if isinstance(p, dict) else None
    if not raw:
        return None
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else None
    except Exception:
        return None


_RULES = kitrules.rules()


PREF_KEYS = {"vibe": {"boom", "precision", "stealth", "hold", "any"},
             "focus": {"at", "ch", "st", "support", "scout", "any"},
             "armor": {"Light", "Medium", "Heavy", "any"},
             "front": {"terminids", "automatons", "illuminate", "any"}}


_ARMOR_NAMES = {r["name"] for r in loader.items().get("armor", [])}


def _prefs_of(locker_id) -> dict:
    lk = db.get_locker(locker_id) if locker_id else None
    try:
        p = json.loads(lk["prefs_json"]) if lk and lk.get("prefs_json") else {}
    except Exception:
        p = {}
    out = {k: v for k, v in p.items() if k in PREF_KEYS and v in PREF_KEYS[k] and v != "any"}
    if p.get("armor_set") in _ARMOR_NAMES:   # the exact armour the diver wears
        out["armor_set"] = p["armor_set"]
    return out


def _resolve(lobby) -> dict:
    """Live directive for the whole lobby, or players-only if no mission set."""
    players_rows = db.list_players(lobby["id"])
    mission = _mission_from(lobby)
    roster = []
    for i, p in enumerate(players_rows):
        roster.append(Player(
            id=p["id"], callsign=p["callsign"] or f"Diver {i+1}",
            play_style=p["play_style"] or "by_the_book",
            owned_items=_owned_of(p),
            accent_hex=ACCENTS[i % len(ACCENTS)],
            accuracy=_accuracy_of(p),
            derived=_derived_of(p),
            favorites=[{"name": o["name"], "kit": o["kit"]} for o in db.list_loadouts(p["locker_id"])[:3]]
            if p.get("locker_id") else [],
            prefs=_prefs_of(p.get("locker_id")),
        ))
    directive = None
    by_pid = {}
    readiness = _readiness(lobby, players_rows, mission)
    if readiness["ready"] and not lobby.get("briefed"):
        # the squad just completed: lock this roster so a late joiner can't un-ready it
        db.lock_roster(lobby["id"], [p["id"] for p in players_rows])
        lobby = db.get_lobby(lobby["id"])
        readiness = _readiness(lobby, players_rows, mission)
    # Loadouts are generated once, holistically, for the locked roster (the divers present
    # when the squad completed, the creator generated, or the mission/reroll last changed).
    # Late joiners are fitted around them in their own group and never reshuffle anyone.
    if readiness["final"] and mission and mission.get("mission_id") and roster:
        locked = set(json.loads(lobby["roster_json"])) if lobby.get("roster_json") else {p.id for p in roster}
        core = [p for p in roster if p.id in locked] or roster[:SQUAD_MAX]
        rest = [p for p in roster if p not in core]
        groups = [core[i:i + SQUAD_MAX] for i in range(0, len(core), SQUAD_MAX)]
        groups += [rest[i:i + SQUAD_MAX] for i in range(0, len(rest), SQUAD_MAX)]
        taken, d, mind_status = set(), None, {"status": "off"}
        for gi, grp in enumerate(groups):
            for pl in grp:  # later groups avoid the stratagems the squad already brings
                pl.excluded_items = sorted(taken)
            dg = resolve_squad(_session_of(mission, lobby), grp, {})
            if gi == 0:   # WARMIND thinks it over: the planner's picks, checked by the engine
                plan, mind_status = mind.plan_for(lobby["id"], _session_of(mission, lobby), grp, mission)
                if plan:
                    try:
                        dg, info = mind.apply(_session_of(mission, lobby), grp, plan)
                        mind_status.update(info)
                    except Exception as e:   # a bad plan never breaks the briefing
                        mind_status = {"status": "failed", "error": str(e)[:200]}
            taken |= {s for a in dg.assignments for s in a.stratagems}
            if d is None:
                d = dg
            else:
                d.assignments.extend(dg.assignments)
        by_pid = {a.player_id: a for a in d.assignments}
        directive = {
            # top/driver are computed methods on Pressure — the dataclass serializer
            # drops them, so send them explicitly or "The read" renders empty.
            "pressure": {"top": d.pressure.top(), "driver": d.pressure.driver(),
                         "vector": d.pressure.vector},
            "matrix": d.capability_matrix,
            "compass": compass.squad([compass.point([_POOL.get(n) for n in [x.primary, x.secondary, x.grenade, x.armor] + list(x.stratagems)])
                                      for x in d.assignments]),
            "loop": d.loop, "cadence": d.cadence, "reactive": d.reactive_role, "notes": d.notes,
            "swaps": d.swaps, "doctrine": d.doctrine, "notes_i18n": d.notes_i18n,
            # squad redundancy/impact review, each line carrying its research sources
            "review": [dict(r, sources=_RULES.get(r["rule"], {}).get("sources", [])) for r in d.review],
            "mind": mind_status,
            "front": d.front,      # this faction's spawners and who in the squad kills them   # WARMIND's planner: off / thinking / ready / failed / budget
        }

    players_out = []
    for i, p in enumerate(players_rows):
        a = by_pid.get(p["id"])
        res = db.latest_result(p["id"])
        snap = json.loads(p["snapshot_json"]) if p["snapshot_json"] else None
        rates = _round(stats.derive(snap)) if snap else None
        players_out.append({
            "id": p["id"], "callsign": p["callsign"], "accent": ACCENTS[i % len(ACCENTS)],
            "play_style": p["play_style"], "style_source": p["style_source"],
            "style_note": p["style_note"], "style_note_i18n": _style_phrase(p, snap), "has_stats": bool(snap),
            # what the stat read itself says (also for remembered reads), for "why this kit"
            "style_read": ({"style": stats.classify(snap)[0], **stats.classify_phrase(snap)} if snap else None),
            "stats": snap, "rates": rates,   # the numbers read from the screenshots, for verification
            "scorecard": stats.scorecard(snap) if snap else None,  # cool derived display stats
            "confidence": _conf_of(p),       # which read fields were double-read-verified
            "owned": _owned_of(p),           # None = owns everything; else every item owned
            "gear_confirmed": bool(p.get("gear_confirmed")),
            "go": bool(p.get("go")),
            "locker": bool(p.get("locker_id")),   # gear + stats come from the diver's locker
            "assignment": _assignment_dict(a) if a else None,
            "aar": ({"text": res["aar_text"], "result": json.loads(res["result_json"]),
                     "verdicts": _with_endorsements(res, players_rows),
                     "verdict": (_verdicts_of(res.get("verdict_json")) or [None])[0]}
                    if res else None),
        })
    all_snaps = [json.loads(p["snapshot_json"]) for p in players_rows if p["snapshot_json"]]
    return {
        "id": lobby["id"], "name": lobby["name"], "mission": mission,
        "players": players_out, "directive": directive,
        "squad_readout": stats.squad_readout(all_snaps),
        "squad_readout_keys": stats.squad_readout_keys(all_snaps),
        "readiness": readiness, "reroll": int(lobby.get("reroll") or 0), "created_at": lobby.get("created_at"),
        "room": _room_brief(lobby.get("room_id")),
    }


SQUAD_MAX = 4  # a Helldivers 2 squad


def _session_of(mission, lobby) -> Session:
    return Session(
        planet_name=mission.get("planet_name", ""),
        planet_hazards=mission.get("planet_hazards", []),
        mission_id=mission["mission_id"], faction=mission.get("faction", "automatons"),
        difficulty=mission.get("difficulty", 7), mode=mission.get("mode", "improvement"),
        operation_modifiers=mission.get("operation_modifiers", []),
        tactical_objectives=mission.get("tactical_objectives", []),
        is_city_map=mission.get("is_city_map", False),
        stealth=bool(mission.get("stealth", False)),
        roles=dict(mission.get("roles") or {}),
        free_stratagems=list(mission.get("free_stratagems") or []),
        dss_actions=list(mission.get("dss_actions") or []),
        seed=int(lobby.get("reroll") or 0),
    )


def _readiness(lobby, players_rows, mission) -> dict:
    """What the holistic briefing still needs. Loadouts are generated only once the
    squad is full and everyone has a read + gear — or the creator briefs early."""
    joined = len(players_rows)
    expected = lobby.get("squad_size") or max(joined, 1)  # older lobbies: whoever's here
    read = sum(1 for p in players_rows if (p.get("style_source") or "pending") != "pending")
    gear = sum(1 for p in players_rows if p.get("gear_confirmed"))
    mission_set = bool(mission and mission.get("mission_id"))
    ready = mission_set and joined >= expected and read >= joined and gear >= joined and joined > 0
    briefed = bool(lobby.get("briefed"))
    return {"expected": expected, "joined": joined, "read": read, "gear": gear,
            "mission_set": mission_set, "ready": ready, "briefed": briefed,
            "final": ready or briefed}


def _with_endorsements(res, players_rows):
    """Verdicts plus, for the ones the table can endorse, who has and how many are needed."""
    vs = _verdicts_of(res.get("verdict_json"))
    names = {p["id"]: p["callsign"] for p in players_rows}
    got = db.endorsements(res["id"])
    need = oaths.needed_endorsements(len(players_rows))
    out = []
    for v in vs:
        if not v:
            continue
        v = dict(v)
        if v.get("endorsable") or v.get("passed") is None or v.get("endorsed_by"):
            ids = got.get(v["oath"], [])
            v["endorsers"] = [names.get(i, "?") for i in ids]
            v["endorser_ids"] = ids
            v["needed"] = need
        out.append(v)
    return out


@app.post("/api/lobby/{lid}/player/{pid}/endorse")
def endorse(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    """Another diver at the table vouches that `pid` kept an oath no scoreboard shows.
    Enough endorsements (a majority of the other divers, at least one) keep the oath:
    the verdict passes, records who endorsed it, and earns the medal."""
    who = _require_player(str(payload.get("by") or ""), x_token)
    subject = db.get_player(pid)
    if not subject or subject["lobby_id"] != lid or who["lobby_id"] != lid:
        raise HTTPException(404, "not at this war table")
    if who["id"] == pid:
        raise HTTPException(400, "you can't endorse your own oath")
    res = db.latest_result(pid)
    if not res:
        raise HTTPException(400, "no debrief to endorse yet")
    oath = str(payload.get("oath") or "")
    verdicts = _verdicts_of(res.get("verdict_json"))
    v = next((x for x in verdicts if x and x.get("oath") == oath), None)
    if not v or v.get("passed") is False:
        raise HTTPException(400, "nothing to endorse for that oath")
    db.add_endorsement(res["id"], oath, who["id"])
    players = db.list_players(lid)
    ids = db.endorsements(res["id"]).get(oath, [])
    if v.get("passed") is None and len(ids) >= oaths.needed_endorsements(len(players)):
        names = {p["id"]: p["callsign"] for p in players}
        lobby = db.get_lobby(lid)
        mission = _mission_from(lobby) or {}
        v.update(passed=True, endorsed_by=[names.get(i, "?") for i in ids], reason_key="v.endorsed",
                 reason_params={"names": ", ".join(names.get(i, "?") for i in ids)},
                 reason="Endorsed by " + ", ".join(names.get(i, "?") for i in ids) + ".")
        v["medal"] = oaths.medal(v, lobby_id=lid, player_id=pid, result=json.loads(res["result_json"] or "{}"), mode=mission.get("mode"))
        db.set_result_verdicts(res["id"], verdicts)
        if lobby.get("room_id") and v.get("medal"):
            db.room_log(lobby["room_id"], "medal", json.dumps({"k": "log.endorsed", "p": {"who": subject["callsign"], "medal": v["medal"]["name"],
                                                                                            "names": ", ".join(v["endorsed_by"])}}))
    return _resolve(db.get_lobby(lid))


def _round(d: dict) -> dict:
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in (d or {}).items()}


def _assignment_dict(a):
    return {
        "role": a.role, "primary": a.primary, "secondary": a.secondary, "grenade": a.grenade,
        "armor": a.armor, "armor_weight": a.armor_weight, "armor_passive": a.armor_passive,
        "booster": a.booster, "stratagems": a.stratagems, "growth_slot": a.growth_slot,
        "thin": a.thin, "thin_axes": [_AXIS_CODE.get(t, t) for t in a.thin],
        "rationale": a.rationale, "rationale_parts": a.rationale_parts,
        "why": a.why,   # "why this kit": [{"kind", "k", "p"}], translated on the client
        "compass": compass.point([_POOL.get(n) for n in [a.primary, a.secondary, a.grenade, a.armor] + list(a.stratagems)]),
    }


_AXIS_CODE = {v: k for k, v in coverage.AXIS_LABEL.items()}
_POOL = Pool()  # "heavy armour" -> "at", for the client


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "?")


def _charge(request: Request, lid: str, calls: int) -> None:
    """Spend guard for billed vision calls (no-op in mock mode). Raises budget.OverBudget."""
    if not vision.status().get("mock"):
        budget.charge(lid, _ip(request), calls)


def _media_type(upload: UploadFile) -> str:
    ct = (upload.content_type or "").lower()
    return ct if ct in ("image/png", "image/jpeg", "image/webp", "image/gif") else "image/png"


async def _read_images(uploads) -> list:
    """UploadFile list (or single/None) -> [(bytes, media_type)], skipping empties. Cap 8."""
    if uploads is None:
        return []
    if not isinstance(uploads, (list, tuple)):
        uploads = [uploads]
    out = []
    for up in uploads[:8]:
        if up is None:
            continue
        data = await up.read()
        if data:
            out.append((data, _media_type(up)))
    return out


PLAY_STYLE_DESC = {
    "siege_anchor": "Holds ground and fortifies it — turrets, emplacements, a prepared position.",
    "danger_close": "Ordnance-first — eagles and stratagems lead every engagement.",
    "fire_for_effect": "Orbital bombardment specialist; softens targets before contact.",
    "forward_eye": "Mobile scout — marksman, covers ground, marks objectives ahead of the squad.",
    "by_the_book": "Balanced generalist with no single dominant tendency.",
}


# ---------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    missions = [
        {"id": m["id"], "name": m["display_name"], "factions": m.get("factions", []),
         "dmin": m.get("difficulty_min", 1), "dmax": m.get("difficulty_max", 10)}
        for m in loader.missions().values()
    ]
    hazards = [{"id": k, "name": v["display_name"]} for k, v in loader.hazards().items()]
    op_mods = [{"id": m["id"], "name": m["display_name"], "faction": m.get("faction", "any"),
                "dmin": m.get("difficulty_min", 1), "desc": m.get("description", ""),
                "group": m.get("group", "operation")}
               for m in loader.operation_modifiers().values()]
    tacticals = [{"id": t["id"], "name": t["display_name"], "faction": t.get("faction", "any"),
                  "dmin": t.get("difficulty_min", 1), "dmax": t.get("difficulty_max", 10)}
                 for t in loader.tactical_objectives().values()]
    from warmind.roles import ROLES, PLAY_STYLES
    roles = [{"name": r.name, "blurb": r.blurb, "reactive": r.reactive} for r in ROLES.values()]
    play_styles = [{"key": k, "label": PLAY_STYLES[k].label, "desc": PLAY_STYLE_DESC.get(k, "")}
                   for k in stats.ALLOWED]
    return {"missions": sorted(missions, key=lambda x: x["name"]),
            "hazards": sorted(hazards, key=lambda x: x["name"]),
            "tacticals": sorted(tacticals, key=lambda x: x["name"]),
            "op_modifiers": sorted(op_mods, key=lambda x: x["name"]),
            "archetypes": list(stats.ALLOWED), "roles": roles, "play_styles": play_styles,
            "warbonds": loader.warbond_catalog()["warbonds"],
            "oaths": oaths.catalog(),
            "wiki": loader.wiki_map(),
            "kit_rules": list(_RULES.values()),
            "armory": loader.armory(),
            "sources": loader.sources()["list"],
            "pics": loader.pictures(),
            "passives": {k: v.get("effect", "") for k, v in passives.table().items()},
            "vision": vision.status()}


@app.get("/api/war")
def war_feed():
    """Active planets + Major Orders from the community war API (cached; no model calls)."""
    return JSONResponse(war.snapshot(), headers={"Cache-Control": "public, max-age=60"})


# ---------------------------------------------------------------- feedback
FEEDBACK_KINDS = ("bug", "idea", "other")
_fb_hits: dict = {}   # ip -> [timestamps]; a light brake on spam (the backlog is public)


@app.post("/api/feedback")
def feedback(payload: dict, request: Request):
    """Save a feedback note (name, kind, text, where in the app). It becomes a public
    GitHub issue on the next daily sync, so the form says so."""
    text = str(payload.get("text") or "").strip()
    if len(text) < 3:
        raise HTTPException(400, "feedback is empty")
    now, ip = time.time(), _ip(request)
    hits = [t for t in _fb_hits.get(ip, []) if t > now - 3600]
    if len(hits) >= 6:
        raise HTTPException(429, "Thanks, that's plenty for this hour. Try again later.")
    _fb_hits[ip] = hits + [now]
    kind = payload.get("kind") if payload.get("kind") in FEEDBACK_KINDS else "other"
    fid = _id(6)
    db.add_feedback(fid, str(payload.get("name") or "").strip()[:40] or "Anonymous diver", kind, text[:2000],
                    str(payload.get("lobby") or "")[:12], str(payload.get("page") or "")[:24],
                    str(payload.get("lang") or "en")[:8])
    return {"ok": True, "id": fid}


@app.get("/api/feedback/export")
def feedback_export(after: float = 0.0):
    """Feedback for the daily GitHub sync (public by design: it's published as issues)."""
    return {"items": db.list_feedback(after)}


# ---------------------------------------------------------------- lobby lifecycle
@app.post("/api/lobby")
def create_lobby(name: str = Form("Squad"), squad_size: int = Form(4), room_id: str = Form(""),
                 callsign: str = Form(""), locker_id: str = Form(""), locker_key: str = Form("")):
    lid, token = _id(4), secrets.token_urlsafe(16)
    room = db.get_room(room_id[:40]) if room_id else None
    db.create_lobby(lid, name.strip() or "Squad", token, max(1, min(4, squad_size)))
    lk = _locker_ok(locker_id, locker_key)
    if lk:   # the creator's profile can run this table from any device it signs in on
        db.set_lobby_creator_locker(lid, lk["id"])
    if room:   # a war room's table opens on the room's current mission
        db.set_lobby_room(lid, room["id"])
        if room.get("mission_json"):
            db.set_mission(lid, json.loads(room["mission_json"]))
        db.room_log(room["id"], "table", json.dumps({"k": "log.table", "p": {"name": name.strip() or "Squad",
                    "who": callsign.strip()[:24] or None, "lobby": lid}}))
    return {"lobby_id": lid, "creator_token": token}


@app.post("/api/lobby/{lid}/brief")
def brief_now(lid: str, x_token: str = Header(None)):
    """Creator finalizes the briefing before every expected diver is in."""
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    db.lock_roster(lid, [p["id"] for p in db.list_players(lid)])
    return _resolve(db.get_lobby(lid))


def _clean_roles(v) -> dict:
    from warmind import roles as roles_mod
    if not isinstance(v, dict):
        return {}
    return {str(k)[:40]: r for k, r in list(v.items())[:8] if r in roles_mod.ROLES}


@app.post("/api/lobby/{lid}/roles")
def set_roles(lid: str, payload: dict, x_token: str = Header(None)):
    """Creator applies suggested swaps: {"roles": {pid: ROLE_KEY}} merges in; {"reset": true} clears."""
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    m = _mission_from(lobby) or {}
    if not m.get("mission_id"):
        raise HTTPException(400, "set the mission first")
    pids = {p["id"] for p in db.list_players(lid)}
    new = {} if payload.get("reset") else dict(m.get("roles") or {})
    for pid, r in _clean_roles(payload.get("roles")).items():
        if pid in pids:
            new[pid] = r
    m["roles"] = new
    db.set_mission(lid, m)
    if lobby.get("briefed"):
        db.lock_roster(lid, [p["id"] for p in db.list_players(lid)])
    return _resolve(db.get_lobby(lid))


@app.post("/api/lobby/{lid}/reroll")
def reroll(lid: str, x_token: str = Header(None)):
    """Creator asks for a different-but-equally-sound set of loadouts."""
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    db.bump_reroll(lid)
    if lobby.get("briefed"):  # a reroll regenerates the whole squad, late joiners included
        db.lock_roster(lid, [p["id"] for p in db.list_players(lid)])
    return _resolve(db.get_lobby(lid))


@app.get("/api/lobby/{lid}")
def lobby_state(lid: str):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    return _resolve(lobby)


@app.post("/api/lobbies/summary")
def lobbies_summary(payload: dict):
    """Light summaries for a caller-supplied list of lobby ids (the ones on their
    device). Missing ids are simply omitted so the client can prune them."""
    ids = (payload.get("ids") or [])[:60]
    out = []
    for lid in ids:
        if not isinstance(lid, str):
            continue
        lobby = db.get_lobby(lid)
        if not lobby:
            continue
        mission = _mission_from(lobby)
        mname = None
        if mission and mission.get("mission_id"):
            m = loader.missions().get(mission["mission_id"])
            mname = m["display_name"] if m else None
        out.append({
            "id": lid, "name": lobby["name"], "players": len(db.list_players(lid)),
            "squad_size": lobby.get("squad_size"),
            "mission_name": mname, "mode": mission.get("mode") if mission else None,
            "updated_at": lobby["updated_at"],
        })
    return {"lobbies": out}


def _require_creator(lobby, token):
    if not token or token != lobby["creator_token"]:
        raise HTTPException(403, "only the lobby creator can do that")


@app.post("/api/lobby/{lid}/mission")
def set_mission(lid: str, payload: dict, x_token: str = Header(None)):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    m = _clean_mission(payload.get("mission"))
    db.set_mission(lid, m)
    if lobby.get("briefed"):  # a new mission regenerates the whole squad, late joiners included
        db.lock_roster(lid, [p["id"] for p in db.list_players(lid)])
    return _resolve(db.get_lobby(lid))


def _clean_mission(raw) -> dict:
    m = dict(raw or {})
    from warmind.modes import MODES
    if m.get("mode") not in MODES:
        m["mode"] = "improvement"
    # oaths: up to 3, each judged on its own; "oath" stays as the first for older clients
    picked = m.get("oaths") if isinstance(m.get("oaths"), list) else ([m.get("oath")] if m.get("oath") else [])
    m["oaths"] = [k for i, k in enumerate(picked) if k in oaths.OATHS and k not in picked[:i]][:3]
    m["oath"] = m["oaths"][0] if m["oaths"] else None
    m["stealth"] = bool(m.get("stealth"))
    m["roles"] = _clean_roles(m.get("roles"))
    m["think"] = m.get("think") is not False   # WARMIND's planner on unless the creator turned it off
    m["lang"] = m.get("lang") if m.get("lang") in vision.LANG_NAMES else "en"   # language of the planner's reasons
    known = loader.operation_modifiers()
    m["operation_modifiers"] = [x for x in (m.get("operation_modifiers") or []) if x in known][:12]
    strat_names = {s["name"] for s in loader.items().get("stratagems", [])}
    m["free_stratagems"] = [x for x in (m.get("free_stratagems") or []) if x in strat_names][:2]   # Weapons Experimentation
    m["dss_actions"] = [{"name": str(x.get("name") or "")[:60], "desc": str(x.get("desc") or "")[:300]}
                        for x in (m.get("dss_actions") or []) if isinstance(x, dict) and x.get("name")][:3]   # Democracy Space Station
    m["planet_name"] = str(m.get("planet_name") or "")[:40]   # picked from the live war feed (display only)
    m["planet_hazards"] = [h for h in (m.get("planet_hazards") or []) if h in loader.hazards()]
    try:
        m["difficulty"] = max(1, min(10, int(m.get("difficulty") or 7)))
    except (TypeError, ValueError):
        m["difficulty"] = 7
    if m.get("faction") not in ("automatons", "terminids", "illuminate"):
        m["faction"] = "automatons"
    if m.get("mission_id") and m["mission_id"] not in loader.missions():
        m["mission_id"] = ""
    return m


@app.post("/api/lobby/{lid}/mission/prefill")
async def mission_prefill(lid: str, request: Request, image: UploadFile = File(...), x_token: str = Header(None)):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    data = await image.read()
    try:
        _charge(request, lid, 1)
        suggestion = await run_in_threadpool(vision.parse_mission, data, _media_type(image),
                                             [m["id"] for m in loader.missions().values()])
    except budget.OverBudget as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    return {"suggestion": suggestion}


# ---------------------------------------------------------------- war rooms
# A war room is the squad's lasting home: a current mission its tables open on, orders the
# squad sets itself (tracked from every debrief in the room), a ship's log, ribbons.
# Anyone with the room code can set the mission and orders: it's the squad's room.
_SHIP_A = ["Wrath", "Hammer", "Herald", "Voice", "Fist", "Shield", "Arbiter", "Beacon", "Paragon", "Lantern",
           "Anvil", "Spear", "Oath", "Harbinger", "Vigil", "Torch", "Gavel", "Bastion", "Keeper", "Thunder"]
_SHIP_B = ["Liberty", "the Ballot", "Family Values", "Iron Resolve", "Prosperity", "Managed Democracy", "Truth",
           "Civic Duty", "the Free Market", "Morning Coffee", "Super Earth", "Unanimous Consent", "Due Process",
           "the Constitution", "Tax Season", "Eternal Vigilance", "Patriotic Fervor", "Voter Turnout"]
ORDER_KINDS = {"drops", "medals", "oaths", "kills", "planet", "difficulty", "d100", "custom"}
RIBBONS = [("first_drop", lambda st: st["drops"] >= 1), ("ten_drops", lambda st: st["drops"] >= 10),
           ("fifty_drops", lambda st: st["drops"] >= 50), ("medals5", lambda st: st["medals"] >= 5),
           ("d100", lambda st: st["d100"] >= 1), ("tourist", lambda st: len(st["planets"]) >= 5),
           ("order", lambda st: st["orders_done"] >= 1), ("muster", lambda st: st["full"] >= 1)]


def _ship_name(seed: str) -> str:
    h = int(hashlib.sha1(seed.encode()).hexdigest(), 16)
    return f"SES {_SHIP_A[h % len(_SHIP_A)]} of {_SHIP_B[(h // 97) % len(_SHIP_B)]}"


def _room_brief(rid):
    r = db.get_room(rid) if rid else None
    return {"id": r["id"], "name": r["name"], "ship": r["ship"]} if r else None


def _who(x_locker_id, x_locker):
    lk = _locker_ok(x_locker_id, x_locker)
    return (lk.get("callsign") or None) if lk else None


def _room_tally(results, since=0.0):
    """What the room's debriefs add up to (from `since`)."""
    rs = [r for r in results if (r["created_at"] or 0) >= since]
    drops, planets, d100, diff = set(), {}, set(), {}
    medals = oaths_kept = kills = 0
    for r in rs:
        m = json.loads(r["mission_json"]) if r.get("mission_json") else {}
        drops.add(r["lobby_id"])
        if m.get("planet_name"):
            planets.setdefault(m["planet_name"], set()).add(r["lobby_id"])
        if m.get("mode") == "d100":
            d100.add(r["lobby_id"])
        diff[r["lobby_id"]] = int(m.get("difficulty") or 0)
        res = json.loads(r["result_json"]) if r.get("result_json") else {}
        kills += int(res.get("kills") or 0)
        for v in _verdicts_of(r.get("verdict_json")):
            if v and v.get("passed"):
                oaths_kept += 1
            if v and v.get("medal"):
                medals += 1
    return {"drops": len(drops), "planets": {k: len(v) for k, v in planets.items()}, "d100": len(d100),
            "medals": medals, "oaths": oaths_kept, "kills": kills, "diff": diff}


def _order_progress(o, results):
    t = _room_tally(results, o["created_at"] or 0)
    prm = json.loads(o["params_json"]) if o.get("params_json") else {}
    k = o["kind"]
    if k == "planet":
        return t["planets"].get(prm.get("planet") or "", 0)
    if k == "difficulty":
        return sum(1 for d in t["diff"].values() if d >= int(prm.get("min") or 10))
    if k == "custom":
        return o["target"] if o.get("done_at") else 0
    return {"drops": t["drops"], "medals": t["medals"], "oaths": t["oaths"], "kills": t["kills"], "d100": t["d100"]}.get(k, 0)


def _room_out(rid):
    r = db.get_room(rid)
    if not r:
        raise HTTPException(404, "war room not found")
    results = db.room_results(rid)
    orders = []
    for o in db.room_orders(rid):
        prog = _order_progress(o, results)
        if prog >= (o["target"] or 1) and not o.get("done_at"):
            db.update_room_order(o["id"], rid, done_at=time.time())
            db.room_log(rid, "order", json.dumps({"k": "log.order", "p": {"title": o["title"], "kind": o["kind"], "n": o["target"],
                                                                         "params": json.loads(o["params_json"]) if o.get("params_json") else {}}}))
            o["done_at"] = time.time()
        orders.append({"id": o["id"], "kind": o["kind"], "title": o["title"], "target": o["target"],
                       "params": json.loads(o["params_json"]) if o.get("params_json") else {},
                       "progress": min(prog, o["target"] or 1), "set_by": o.get("set_by"), "at": o["created_at"],
                       "done_at": o.get("done_at")})
    lobbies = db.room_lobbies(rid)
    tables = []
    full = 0
    for l in lobbies:
        n = len(db.list_players(l["id"]))
        full += n >= 4
        tables.append({"id": l["id"], "name": l["name"], "players": n, "squad_size": l.get("squad_size"),
                       "at": l["created_at"], "mission": _mission_name(l.get("mission_json"))})
    tally = _room_tally(results)
    nights = len({time.strftime("%Y-%m-%d", time.gmtime(l["created_at"] or 0)) for l in lobbies})
    st = dict(tally, full=full, orders_done=sum(1 for o in orders if o["done_at"]))
    log = []
    for e in db.room_log_list(rid):
        try:
            body = json.loads(e["text"])
        except Exception:
            body = {"t": e["text"]}
        log.append(dict(body, at=e["at"], kind=e["kind"]))
    members = [{"id": m["locker_id"], "callsign": m["callsign"], "play_style": m["play_style"],
                "public": bool(m["public"])} for m in db.room_members(rid) if m.get("callsign")]
    return {"id": r["id"], "name": r["name"], "ship": r["ship"], "created_at": r["created_at"],
            "mission": json.loads(r["mission_json"]) if r.get("mission_json") else None,
            "mission_name": _mission_name(r.get("mission_json")), "mission_by": r.get("mission_by"),
            "orders": orders, "tables": tables, "members": members, "log": log,
            "stats": {"tables": len(lobbies), "nights": nights, "drops": tally["drops"], "medals": tally["medals"],
                      "oaths": tally["oaths"], "kills": tally["kills"], "planets": tally["planets"]},
            "ribbons": [k for k, f in RIBBONS if f(st)]}


@app.post("/api/room")
def create_room(payload: dict, x_locker_id: str = Header(None), x_locker: str = Header(None)):
    rid, token = _id(4), secrets.token_urlsafe(16)
    name = str(payload.get("name") or "").strip()[:40] or "War Room"
    db.create_room(rid, name, _ship_name(rid), token)
    lk = _locker_ok(x_locker_id, x_locker)
    if lk:
        db.add_room_member(rid, lk["id"])
    db.room_log(rid, "open", json.dumps({"k": "log.open", "p": {"who": (lk or {}).get("callsign")}}))
    return {"room_id": rid, "creator_token": token}


@app.get("/api/room/{rid}")
def get_room(rid: str):
    return _room_out(rid[:40])


@app.post("/api/room/{rid}/join")
def join_room(rid: str, x_locker_id: str = Header(None), x_locker: str = Header(None)):
    if not db.get_room(rid):
        raise HTTPException(404, "war room not found")
    lk = _require_locker(x_locker_id, x_locker)
    if not any(m["locker_id"] == lk["id"] for m in db.room_members(rid)):
        db.add_room_member(rid, lk["id"])
        db.room_log(rid, "member", json.dumps({"k": "log.member", "p": {"who": lk.get("callsign") or "?"}}))
    return {"ok": True}


@app.post("/api/room/{rid}/name")
def rename_room(rid: str, payload: dict, x_token: str = Header(None)):
    r = db.get_room(rid)
    if not r:
        raise HTTPException(404, "war room not found")
    if not x_token or x_token != r["creator_token"]:
        raise HTTPException(403, "only the room's founder can rename it")
    db.update_room(rid, name=str(payload.get("name") or "").strip()[:40] or r["name"],
                   ship=str(payload.get("ship") or "").strip()[:48] or r["ship"])
    return _room_out(rid)


@app.post("/api/room/{rid}/mission")
def room_mission(rid: str, payload: dict, x_locker_id: str = Header(None), x_locker: str = Header(None)):
    if not db.get_room(rid):
        raise HTTPException(404, "war room not found")
    who = _who(x_locker_id, x_locker)
    if payload.get("clear"):
        db.update_room(rid, mission_json=None, mission_by=who)
        return _room_out(rid)
    m = _clean_mission(payload.get("mission"))
    m.pop("roles", None)   # creator-applied swaps belong to one table, not the room
    db.update_room(rid, mission_json=json.dumps(m), mission_by=who)
    label = (_mission_name(json.dumps(m)) or {}).get("name") or m.get("planet_name") or m.get("faction")
    # tonight's open tables in the room follow: any table from the last day with no debrief yet
    pushed = 0
    for l in db.room_lobbies(rid):
        if time.time() - (l.get("created_at") or 0) > 86400 or db.lobby_has_results(l["id"]):
            continue
        keep = {k: v for k, v in (_mission_from(l) or {}).items() if k in ("roles", "lang", "think")}   # the table's own swaps + settings
        db.set_mission(l["id"], dict(m, **keep))
        if l.get("briefed"):
            db.lock_roster(l["id"], [p["id"] for p in db.list_players(l["id"])])
        pushed += 1
    db.room_log(rid, "mission", json.dumps({"k": "log.mission", "p": {"who": who, "what": label, "planet": m.get("planet_name"), "n": pushed}}))
    out = _room_out(rid)
    out["pushed"] = pushed
    return out


@app.post("/api/room/{rid}/orders")
def add_order(rid: str, payload: dict, x_locker_id: str = Header(None), x_locker: str = Header(None)):
    if not db.get_room(rid):
        raise HTTPException(404, "war room not found")
    kind = payload.get("kind")
    if kind not in ORDER_KINDS:
        raise HTTPException(400, "unknown order")
    if len(db.room_orders(rid)) >= 12:
        raise HTTPException(400, "twelve standing orders is plenty: retire one first")
    try:
        target = max(1, min(100000, int(payload.get("target") or 1)))
    except (TypeError, ValueError):
        target = 1
    params = {}
    if kind == "planet":
        params["planet"] = str((payload.get("params") or {}).get("planet") or "")[:40]
        if not params["planet"]:
            raise HTTPException(400, "pick a planet")
    if kind == "difficulty":
        params["min"] = max(1, min(10, int((payload.get("params") or {}).get("min") or 10)))
    title = str(payload.get("title") or "").strip()[:80]
    if kind == "custom" and not title:
        raise HTTPException(400, "give the order a name")
    who = _who(x_locker_id, x_locker)
    db.add_room_order(_id(4), rid, kind, title, 1 if kind == "custom" else target, params, who)
    db.room_log(rid, "neworder", json.dumps({"k": "log.neworder", "p": {"who": who, "title": title, "kind": kind,
                                                                          "n": target, "params": params}}))
    return _room_out(rid)


@app.post("/api/room/{rid}/orders/{oid}")
def edit_order(rid: str, oid: str, payload: dict):
    if not db.get_room(rid):
        raise HTTPException(404, "war room not found")
    if payload.get("retire"):
        db.update_room_order(oid, rid, retired=1)
    if payload.get("done") is not None:
        db.update_room_order(oid, rid, done_at=time.time() if payload["done"] else None)
    return _room_out(rid)


@app.post("/api/rooms/summary")
def rooms_summary(payload: dict, x_locker_id: str = Header(None), x_locker: str = Header(None)):
    """The rooms this device or profile knows: for the home tab and the new-table picker."""
    ids = [str(x)[:40] for x in (payload.get("ids") or [])][:40]
    lk = _locker_ok(x_locker_id, x_locker)
    rows = {r["id"]: r for r in (db.locker_rooms(lk["id"]) if lk else [])}
    for i in ids:
        if i not in rows:
            r = db.get_room(i)
            if r:
                rows[i] = r
    out = []
    for r in sorted(rows.values(), key=lambda r: -(r["updated_at"] or 0)):
        out.append({"id": r["id"], "name": r["name"], "ship": r["ship"], "updated_at": r["updated_at"],
                    "mission_name": _mission_name(r.get("mission_json")),
                    "planet": (json.loads(r["mission_json"]) if r.get("mission_json") else {}).get("planet_name"),
                    "tables": len(db.room_lobbies(r["id"], 200))})
    return {"rooms": out}


@app.post("/api/lobby/{lid}/room")
def attribute_lobby(lid: str, payload: dict, x_token: str = Header(None)):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    rid = str(payload.get("room_id") or "")[:40] or None
    if rid and not db.get_room(rid):
        raise HTTPException(404, "war room not found")
    db.set_lobby_room(lid, rid)
    if rid:
        db.room_log(rid, "table", json.dumps({"k": "log.table", "p": {"name": lobby["name"], "lobby": lid}}))
    return _resolve(db.get_lobby(lid))


@app.post("/api/lobby/{lid}/player/{pid}/go")
def player_go(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    if p["lobby_id"] != lid:
        raise HTTPException(404, "player not in this lobby")
    db.set_player_go(pid, bool(payload.get("go")))
    return _resolve(db.get_lobby(lid))


# ---------------------------------------------------------------- players
@app.post("/api/lobby/{lid}/join")
async def join(lid: str, request: Request, callsign: str = Form(""), images: list[UploadFile] = File(default=[]),
               locker_id: str = Form(""), locker_key: str = Form("")):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    lk = _locker_ok(locker_id, locker_key)   # the diver's locker, if their device has one
    if lk and not callsign.strip():
        callsign = lk.get("callsign") or ""
    pid, token = _id(4), secrets.token_urlsafe(16)
    n_existing = len(db.list_players(lid))
    if n_existing >= 4:   # a Helldivers squad is four
        raise HTTPException(409, "This war table is full: four divers already joined.")
    if lobby.get("squad_size") and n_existing >= lobby["squad_size"]:
        db.set_squad_size(lid, n_existing + 1)   # one more than planned: the briefing waits for them too
    snapshot, play_style, source, note = None, "by_the_book", "pending", "Pick a style or upload your career stats."
    parsed_call = callsign.strip()
    imgs = await _read_images(images)
    vision_error, confidence, over_budget = None, None, False
    if imgs:
        try:
            _charge(request, lid, 2)  # double read
            parsed = await run_in_threadpool(vision.parse_career, imgs, mock_index=n_existing)
            snapshot = parsed["snapshot"]
            play_style, note, source = parsed["play_style"], parsed["style_note"], "screenshot"
            parsed_call = parsed_call or parsed.get("callsign") or ""
            confidence = parsed.get("confidence")
        except budget.OverBudget as e:  # spend cap: still join, just without the read
            vision_error, over_budget = str(e), True
            note = str(e)
        except Exception as e:
            # A bad/unreadable screenshot must never lock a diver out of the lobby.
            # Join them with a pending style and let them pick one or retry.
            vision_error = str(e)
            note = "Couldn't read that screenshot — pick your style or try another shot."
    restored = False
    if snapshot is None and not vision_error and lk and lk.get("snapshot_json"):
        # their locker has a stat read: use it (no screenshot needed)
        snapshot = json.loads(lk["snapshot_json"])
        play_style = lk.get("play_style") or stats.classify(snapshot)[0]
        when = time.strftime("%b %d", time.gmtime(lk.get("updated_at") or time.time()))
        note, source, restored = (f"From your locker ({when}): upload new stats to refresh.", "remembered", True)
        confidence = json.loads(lk["confidence_json"]) if lk.get("confidence_json") else None
    if snapshot is None and not vision_error and parsed_call:
        # returning diver, no new screenshot: restore their last read by callsign
        mem = db.recall_callsign(parsed_call)
        if mem and mem.get("snapshot_json"):
            snapshot = json.loads(mem["snapshot_json"])
            play_style = mem.get("play_style") or stats.classify(snapshot)[0]
            when = time.strftime("%b %d", time.gmtime(mem.get("updated_at") or time.time()))
            note, source, restored = (f"Restored your last stat read ({when}) by callsign — re-upload to refresh.",
                                      "remembered", True)
            confidence = json.loads(mem["confidence_json"]) if mem.get("confidence_json") else None
    if snapshot is None and not vision_error and parsed_call and not lk:
        # picked from the roster on a new device: their profile's latest read
        pub = db.public_locker_by_callsign(parsed_call)
        if pub:
            snapshot = json.loads(pub["snapshot_json"])
            play_style = pub.get("play_style") or stats.classify(snapshot)[0]
            when = time.strftime("%b %d", time.gmtime(pub.get("updated_at") or time.time()))
            note, source, restored = (f"From your profile ({when}): upload new stats to refresh.", "remembered", True)
    callsign_final = parsed_call or f"Diver {n_existing + 1}"
    db.add_or_update_player(pid, lid, token, callsign_final, play_style, source, note, snapshot)
    if confidence:
        db.set_confidence(pid, confidence)
    if source == "screenshot":
        db.remember_callsign(callsign_final, snapshot, confidence, play_style, note)
    # remembered gear: the locker's, else what this callsign set last time
    gear_restored = None
    mem = db.recall_callsign(callsign_final)
    if lk:
        db.link_player_locker(pid, lk["id"])
        if lobby.get("room_id") and not any(m["locker_id"] == lk["id"] for m in db.room_members(lobby["room_id"])):
            db.add_room_member(lobby["room_id"], lk["id"])   # a table in a war room brings you aboard
            db.room_log(lobby["room_id"], "member", json.dumps({"k": "log.member", "p": {"who": callsign_final}}))
        if source == "screenshot":
            _locker_stats_from(lk["id"], snapshot, confidence, play_style, note)
        if not lk.get("callsign"):
            db.update_locker(lk["id"], callsign=callsign_final)
        mem = {"gear_set": lk.get("gear_set"), "owned_json": lk.get("owned_json")} if lk.get("gear_set") else mem
    if mem and mem.get("gear_set"):
        owned = _owned_from_json(mem.get("owned_json"))   # drops names no longer in the catalog
        db.set_owned(pid, _owned_store(owned))
        gear_restored = len(owned) if owned is not None else "all"
    return {"player_id": pid, "player_token": token, "play_style": play_style,
            "style_note": note, "style_source": source, "vision_error": vision_error,
            "over_budget": over_budget, "restored": restored, "gear_restored": gear_restored}


def _require_player(pid, token):
    p = db.get_player(pid)
    if not p:
        raise HTTPException(404, "player not found")
    if not token or token != p["token"]:
        raise HTTPException(403, "not your diver")
    return p


def _require_player_or_creator(lid, pid, token):
    """The diver themself, or the lobby creator acting for them (e.g. a diver whose
    device lost their link, or a duplicate diver record being cleaned up)."""
    p = db.get_player(pid)
    lobby = db.get_lobby(lid)
    if not p or not lobby or p["lobby_id"] != lid:
        raise HTTPException(404, "player not found")
    if token and (token == p["token"] or token == lobby["creator_token"]):
        return p
    raise HTTPException(403, "not your diver")


@app.post("/api/lobby/{lid}/player/{pid}/style")
def set_style(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    ps = stats.coerce_play_style(payload.get("play_style"))
    if not ps:
        raise HTTPException(400, "unknown play style")
    db.add_or_update_player(pid, lid, p["token"], p["callsign"], ps, "manual",
                            "Chosen by the diver.", json.loads(p["snapshot_json"]) if p["snapshot_json"] else None)
    return {"ok": True}


@app.post("/api/lobby/{lid}/player/{pid}/callsign")
def set_callsign(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    """Rename after joining (the diver, or the creator for them)."""
    p = _require_player_or_creator(lid, pid, x_token)
    name = " ".join(str(payload.get("callsign") or "").split())[:24]
    if not name:
        raise HTTPException(400, "callsign can't be empty")
    snap = json.loads(p["snapshot_json"]) if p["snapshot_json"] else None
    db.add_or_update_player(pid, lid, p["token"], name, p["play_style"], p["style_source"], p["style_note"], snap)
    if snap:   # remember the stat read under the new name too
        db.remember_callsign(name, snap, _conf_of(p), p["play_style"], p["style_note"])
    return {"ok": True, "callsign": name}


@app.post("/api/lobby/{lid}/player/{pid}/owned")
def set_owned(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    """Set the gear this diver owns. Body: {"owned": [every owned item], "v": 2} or
    {"owned": null} for 'owns everything'. Without "v": 2 (a page loaded before the
    full library), the list is warbond gear only and base gear stays owned.
    Loadouts then avoid unowned gear."""
    p = _require_player(pid, x_token)
    owned = payload.get("owned", None)
    if owned is not None:
        if not isinstance(owned, list):
            raise HTTPException(400, "owned must be a list or null")
        valid = loader.warbond_catalog()["map"]
        owned = [n for n in owned if isinstance(n, str) and n in valid]
        stored = _owned_store(owned) if payload.get("v") == 2 else owned
    else:
        stored = None
    db.set_owned(pid, stored)
    db.remember_gear(p["callsign"], stored)  # the next war table under this callsign starts from it
    if p.get("locker_id"):   # and the diver's locker keeps it
        db.update_locker(p["locker_id"], owned_json=json.dumps(stored) if stored is not None else None, gear_set=1)
    return {"ok": True}


@app.post("/api/lobby/{lid}/player/{pid}/career")
async def update_career(lid: str, pid: str, request: Request, images: list[UploadFile] = File(default=[]),
                        x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    imgs = await _read_images(images)
    if not imgs:
        raise HTTPException(400, "no screenshot provided")
    try:
        _charge(request, lid, 2)  # double read
        parsed = await run_in_threadpool(vision.parse_career, imgs, mock_index=len(db.list_players(lid)))
    except budget.OverBudget as e:
        return {"ok": False, "vision_error": str(e), "over_budget": True}
    except Exception as e:
        # Player already has a spot; a failed re-read just reports back, no crash.
        return {"ok": False, "vision_error": str(e)}
    callsign_final = parsed.get("callsign") or p["callsign"]
    db.add_or_update_player(pid, lid, p["token"], callsign_final,
                            parsed["play_style"], "screenshot", parsed["style_note"], parsed["snapshot"])
    db.set_confidence(pid, parsed.get("confidence"))
    db.remember_callsign(callsign_final, parsed["snapshot"], parsed.get("confidence"),
                         parsed["play_style"], parsed["style_note"])
    if p.get("locker_id"):
        _locker_stats_from(p["locker_id"], parsed["snapshot"], parsed.get("confidence"), parsed["play_style"],
                           parsed["style_note"])
    return {"ok": True, "play_style": parsed["play_style"], "style_note": parsed["style_note"],
            "validity": parsed["validity"], "confidence": parsed.get("confidence")}


@app.post("/api/lobby/{lid}/player/{pid}/result")
async def submit_result(lid: str, pid: str, request: Request, image: UploadFile = File(...), lang: str = Form("en"),
                        x_token: str = Header(None)):
    p = _require_player_or_creator(lid, pid, x_token)
    lobby = db.get_lobby(lid)
    state = _resolve(lobby)
    mission = _mission_from(lobby) or {}
    me = next((x for x in state["players"] if x["id"] == pid), None)
    a = me and me["assignment"]
    baseline = stats.derive(json.loads(p["snapshot_json"])) if p["snapshot_json"] else {}
    ctx = {"role": a and a["role"], "play_style": p["play_style"], "mode": mission.get("mode"),
           "kit": a and {"primary": a["primary"], "stratagems": a["stratagems"]} or {}, "baseline": baseline}
    data, mt = await image.read(), _media_type(image)
    try:
        _charge(request, lid, 2)  # scoreboard read + after-action review
        result = await run_in_threadpool(vision.read_result, data, mt)
    except budget.OverBudget as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    return await _record_result(lid, pid, p, ctx, mission, result, data, mt, lang)


async def _record_result(lid, pid, p, ctx, mission, result, data, mt, lang):
    """Verdicts (decided in code), medals, the review, saved for this diver."""
    # oath verdicts are decided in code from the numbers, before any prose is written
    verdicts = []
    for key in _oaths_of(mission):
        v = oaths.evaluate(key, result)
        if v:
            v["medal"] = oaths.medal(v, lobby_id=lid, player_id=pid, result=result, mode=mission.get("mode"))
            verdicts.append(v)
    try:
        aar = await run_in_threadpool(vision.write_aar, data, mt, result, ctx, verdicts, lang=lang)
    except Exception:
        # the numbers and verdicts already stand; don't lose them over the prose call
        aar = vision._mock_oath_line(verdicts) + "Review text unavailable — the scoreboard was read and recorded."
    db.save_result(_id(5), lid, pid, result, aar, verdicts or None)
    lobby = db.get_lobby(lid) or {}
    if lobby.get("room_id"):   # the ship's log
        medals = [v["medal"]["name"] for v in (verdicts or []) if v and v.get("medal")]
        db.room_log(lobby["room_id"], "drop", json.dumps({"k": "log.drop", "p": {
            "who": p.get("callsign"), "mission": (_mission_name(lobby.get("mission_json")) or {}).get("name") or lobby.get("name"),
            "kills": (result or {}).get("kills"), "deaths": (result or {}).get("deaths"), "medals": medals}}))
    return {"ok": True, "aar": aar, "result": result, "verdicts": verdicts,
            "verdict": verdicts[0] if verdicts else None}


# ---------------------------------------------------------------- whole-squad scoreboard
_squad_reads: dict = {}   # read id -> {"lid", "rows", "data", "mt", "at"}; kept 30 min for the confirm step
SQUAD_READ_TTL = 1800


def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _match_rows(rows: list, players: list) -> dict:
    """Scoreboard row index -> player id, one to one: exact name, then containment,
    then closest spelling (>= 0.6). Rows nobody matches stay unassigned for the squad."""
    import difflib
    out, used = {}, set()
    names = {pl["id"]: _norm_name(pl["callsign"]) for pl in players}
    for test in (lambda a, b: a == b, lambda a, b: a and b and (a in b or b in a),
                 lambda a, b: difflib.SequenceMatcher(None, a, b).ratio() >= 0.6):
        for i, r in enumerate(rows):
            if i in out:
                continue
            rn = _norm_name(r.get("name"))
            for pid, pn in names.items():
                if pid not in used and test(rn, pn):
                    out[i] = pid; used.add(pid)
                    break
    return out


def _require_member(lid, token):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    if token and (token == lobby["creator_token"] or any(token == x["token"] for x in db.list_players(lid))):
        return lobby
    raise HTTPException(403, "join this war table first")


@app.post("/api/lobby/{lid}/results/squad")
async def squad_results_read(lid: str, request: Request, image: UploadFile = File(...), x_token: str = Header(None)):
    """Step 1: read a scoreboard that shows the whole squad; propose who is who."""
    _require_member(lid, x_token)
    players = db.list_players(lid)
    data, mt = await image.read(), _media_type(image)
    try:
        _charge(request, lid, 1)
        rows = await run_in_threadpool(vision.read_squad_results, data, mt, [x["callsign"] for x in players])
    except budget.OverBudget as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    if not rows:
        raise HTTPException(422, "no player columns found on that screenshot")
    now = time.time()
    for k in [k for k, v in _squad_reads.items() if now - v["at"] > SQUAD_READ_TTL]:
        del _squad_reads[k]
    rid = _id(6)
    _squad_reads[rid] = {"lid": lid, "rows": rows, "data": data, "mt": mt, "at": now}
    match = _match_rows(rows, players)
    return {"read_id": rid,
            "rows": [{"i": i, "name": r.get("name"), "kills": r.get("kills"), "deaths": r.get("deaths"),
                      "accuracy_pct": r.get("accuracy_pct")} for i, r in enumerate(rows)],
            "match": {str(i): pid for i, pid in match.items()}}


@app.post("/api/lobby/{lid}/results/squad/{rid}")
async def squad_results_commit(lid: str, rid: str, payload: dict, request: Request, x_token: str = Header(None)):
    """Step 2: the squad confirmed who is who: record every diver's result at once."""
    lobby = _require_member(lid, x_token)
    read = _squad_reads.get(rid)
    if not read or read["lid"] != lid:
        raise HTTPException(410, "that scoreboard read expired, upload it again")
    players = {x["id"]: x for x in db.list_players(lid)}
    assign = {int(i): pid for i, pid in (payload.get("assign") or {}).items()
              if str(i).isdigit() and pid in players and int(i) < len(read["rows"])}
    if len(set(assign.values())) != len(assign):
        raise HTTPException(400, "each diver can only be matched to one column")
    if not assign:
        raise HTTPException(400, "match at least one column to a diver")
    try:
        _charge(request, lid, len(assign))   # one review per diver
    except budget.OverBudget as e:
        raise HTTPException(429, str(e))
    state = _resolve(lobby)
    mission = _mission_from(lobby) or {}
    lang = str(payload.get("lang") or "en")[:8]
    out = []
    for i, pid in assign.items():
        p = players[pid]
        me = next((x for x in state["players"] if x["id"] == pid), None)
        a = me and me["assignment"]
        baseline = stats.derive(json.loads(p["snapshot_json"])) if p["snapshot_json"] else {}
        ctx = {"role": a and a["role"], "play_style": p["play_style"], "mode": mission.get("mode"),
               "kit": a and {"primary": a["primary"], "stratagems": a["stratagems"]} or {}, "baseline": baseline,
               "column": read["rows"][i].get("name")}
        result = {k: v for k, v in read["rows"][i].items() if k in vision.RESULT_FIELDS}
        r = await _record_result(lid, pid, p, ctx, mission, result, read["data"], read["mt"], lang)
        out.append({"player_id": pid, "callsign": p["callsign"], "verdicts": r["verdicts"]})
    _squad_reads.pop(rid, None)
    return {"ok": True, "recorded": out}


@app.delete("/api/lobby/{lid}/player/{pid}")
def leave(lid: str, pid: str, x_token: str = Header(None)):
    _require_player_or_creator(lid, pid, x_token)
    db.remove_player(pid)
    return {"ok": True}


# ---------------------------------------------------------------- static frontend
@app.get("/", response_class=HTMLResponse)
def index():
    return (HERE / "static" / "index.html").read_text()


@app.get("/app.js")
def appjs():
    from fastapi.responses import Response
    return Response((HERE / "static" / "app.js").read_text(), media_type="application/javascript")


@app.get("/i18n.js")
def i18njs():
    from fastapi.responses import Response
    return Response((HERE / "static" / "i18n.js").read_text(), media_type="application/javascript")


@app.get("/icons/{name}")
def icon(name: str):
    """Stratagem icons (64px, from the Helldivers 2 wiki — see the field manual)."""
    if not re.fullmatch(r"[a-z0-9-]+\.(png|svg)", name):
        raise HTTPException(404, "no such icon")
    f = HERE / "static" / "icons" / name
    if not f.exists():
        raise HTTPException(404, "no such icon")
    svg = name.endswith(".svg")
    return FileResponse(f, media_type="image/svg+xml" if svg else "image/png",
                        headers={"Cache-Control": "public, max-age=604800",
                                 # an SVG opened directly must never run script
                                 "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


@app.get("/img/{name}")
def picture(name: str):
    """Weapon / armour renders and booster icons (from the Helldivers 2 wiki — see the field manual)."""
    m = re.fullmatch(r"[a-z0-9-]+\.(png|webp|jpg|svg)", name)
    f = HERE / "static" / "img" / name
    if not m or not f.exists():
        raise HTTPException(404, "no such picture")
    mt = {"png": "image/png", "webp": "image/webp", "jpg": "image/jpeg", "svg": "image/svg+xml"}[m.group(1)]
    return FileResponse(f, media_type=mt, headers={"Cache-Control": "public, max-age=604800",
                                                   "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"})


@app.get("/health")
def health():
    return {"ok": True, "commit": os.environ.get("RENDER_GIT_COMMIT", "")[:12],   # set by Render on each deploy
            "vision": vision.status(), "budget": budget.status(), "war": war.status(),
            "planner": {"enabled": mind.ENABLED, "model": mind.MODEL, "effort": mind.EFFORT, "last": mind.LAST},
            "costs": _cost_brief()}


def _cost_brief():
    try:
        r = costs.report()
        return {"app_today": r["app"]["today"], "app_mtd": r["app"]["mtd"],
                "bill_mtd": (r["bill"] or {}).get("mtd"), "admin": r["admin"]["status"]}
    except Exception as e:
        return {"error": str(e)[:120]}


# ---------------------------------------------------------------- costs
costs.start()   # polls Anthropic's cost report when ANTHROPIC_ADMIN_KEY is set
_last_poll = [0.0]


@app.get("/api/costs")
def get_costs():
    r = costs.report()
    r["caps"] = budget.status()
    r["planner"] = {"model": mind.MODEL, "effort": mind.EFFORT, "enabled": mind.ENABLED}
    r["vision_model"] = vision.MODEL
    r["mock"] = vision.status().get("mock")
    return r


@app.post("/api/costs/poll")
def poll_costs():
    """Refresh Anthropic's cost report now (at most once a minute)."""
    if time.time() - _last_poll[0] < 60:
        raise HTTPException(429, "polled less than a minute ago")
    _last_poll[0] = time.time()
    costs.poll_now()
    return get_costs()


# ---------------------------------------------------------------- lockers
def _locker_ok(lid, key):
    if not lid or not key:
        return None
    lk = db.get_locker(str(lid)[:40])
    return lk if lk and secrets.compare_digest(lk["key"], str(key)) else None


def _require_locker(lid, key):
    lk = _locker_ok(lid, key)
    if not lk:
        raise HTTPException(403, "not your locker")
    return lk


def _locker_stats_from(lid, snapshot, confidence, play_style, note):
    if not snapshot:
        return
    db.add_locker_stats(lid, snapshot, "screenshot")
    db.update_locker(lid, snapshot_json=json.dumps(snapshot), confidence_json=json.dumps(confidence) if confidence else None,
                     play_style=play_style, style_note=note)


def _mission_name(mission_json):
    try:
        m = json.loads(mission_json) if mission_json else None
    except Exception:
        return None
    if not m or not m.get("mission_id"):
        return None
    rec = loader.missions().get(m["mission_id"])
    return {"name": rec["display_name"] if rec else m["mission_id"], "mode": m.get("mode"),
            "difficulty": m.get("difficulty"), "faction": m.get("faction")}


@app.post("/api/locker")
def create_locker(payload: dict):
    """A new locker for this device. Optionally adopt a war-table diver (pid + token):
    their callsign, gear and stat read move in, and the diver is linked."""
    lid, key = _id(5), secrets.token_urlsafe(18)
    name = " ".join(str(payload.get("callsign") or "").split())[:24]
    pin = payload.get("pin")
    if pin is not None:   # the sign-in gate: callsigns are unique there, and need a PIN
        if not _pin_ok(pin):
            raise HTTPException(400, "pick a 4 to 8 digit PIN")
        if not name:
            raise HTTPException(400, "enter a callsign")
        if db.lockers_by_callsign(name):
            raise HTTPException(409, "that callsign is taken: sign in with its PIN")
    db.create_locker(lid, key, name)
    if pin is not None:
        _set_pin(lid, pin)
    pid, tok = payload.get("player_id"), payload.get("player_token")
    if pid and tok:
        p = db.get_player(pid)
        if p and secrets.compare_digest(p["token"], str(tok)):
            _adopt(lid, p)
    return {"locker_id": lid, "locker_key": key}


# ---------------------------------------------------------------- sign in: callsign + PIN
_signin_tries: dict = {}


def _pin_ok(pin) -> bool:
    return isinstance(pin, str) and pin.isdigit() and 4 <= len(pin) <= 8


def _pin_hash(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 120_000).hex()


def _set_pin(lid, pin):
    salt = secrets.token_hex(8)
    db.update_locker(lid, pin_hash=_pin_hash(pin, salt), pin_salt=salt)


def _throttle(key: str, limit=8, window=600):
    now = time.time()
    hits = [t for t in _signin_tries.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(429, "too many tries: wait a few minutes")
    hits.append(now)
    _signin_tries[key] = hits


def _similar_callsigns(name: str) -> list[str]:
    import difflib
    names = sorted({(lk.get("callsign") or "") for lk in db.list_public_lockers(500)} - {""})
    low = {n.lower(): n for n in names}
    near = difflib.get_close_matches(name.lower(), list(low), n=3, cutoff=0.8)
    near += [k for k in low if (k.startswith(name.lower()) or name.lower().startswith(k)) and k not in near and abs(len(k) - len(name)) <= 2]
    return [low[k] for k in near][:3]


@app.post("/api/signin")
def signin(payload: dict, request: Request):
    """Callsign + PIN: this device becomes that diver. A callsign nobody has yet answers
    {"new": true}; a profile from before PINs takes the PIN entered as its own."""
    name = " ".join(str(payload.get("callsign") or "").split())[:24]
    pin = str(payload.get("pin") or "")
    if not name:
        raise HTTPException(400, "enter your callsign")
    _throttle("ip:" + _ip(request), 30)
    found = db.lockers_by_callsign(name)
    if not found:   # nobody has it: the client creates it, unless it looks like a typo of a callsign that exists
        return {"new": True, "callsign": name, "similar": _similar_callsigns(name)}
    if not _pin_ok(pin):
        raise HTTPException(400, "enter your 4 to 8 digit PIN")
    _throttle("cs:" + name.lower())
    for lk in found:
        if lk.get("pin_hash"):
            if secrets.compare_digest(lk["pin_hash"], _pin_hash(pin, lk.get("pin_salt") or "")):
                return {"locker_id": lk["id"], "locker_key": lk["key"], "callsign": lk["callsign"]}
        else:   # first sign-in since PINs arrived: the PIN they choose now is theirs
            _set_pin(lk["id"], pin)
            return {"locker_id": lk["id"], "locker_key": lk["key"], "callsign": lk["callsign"], "pin_set": True}
    raise HTTPException(403, "wrong PIN for that callsign")


@app.post("/api/locker/{lid}/pin")
def locker_pin(lid: str, payload: dict, x_locker: str = Header(None)):
    _require_locker(lid, x_locker)
    if not _pin_ok(payload.get("pin")):
        raise HTTPException(400, "pick a 4 to 8 digit PIN")
    _set_pin(lid, payload["pin"])
    return {"ok": True}


@app.get("/api/locker/{lid}/tables")
def locker_tables(lid: str, x_locker: str = Header(None)):
    """The war tables this profile created or sat at, with what this device needs to be
    them there: the creator token for tables it made, its seat (player id + token) where it joined."""
    _require_locker(lid, x_locker)
    out = []
    for r in db.locker_tables(lid):
        out.append({"lobby_id": r["lobby_id"], "creator_token": r["creator_token"] if r["mine"] else None,
                    "player_id": r["player_id"], "player_token": r["player_token"]})
    return {"tables": out}


def _adopt(lid, p):
    """Link a war-table diver to a locker; fill whatever the locker doesn't have yet."""
    lk = db.get_locker(lid)
    db.link_player_locker(p["id"], lid)
    upd = {}
    if not lk.get("callsign") and p.get("callsign"):
        upd["callsign"] = p["callsign"]
    if not lk.get("gear_set") and p.get("gear_confirmed"):
        upd.update(owned_json=p.get("owned_json"), gear_set=1)
    if p.get("snapshot_json") and (p.get("style_source") == "screenshot" or not lk.get("snapshot_json")):
        db.add_locker_stats(lid, json.loads(p["snapshot_json"]), "screenshot")
        upd.update(snapshot_json=p["snapshot_json"], confidence_json=p.get("confidence_json"),
                   play_style=p.get("play_style"), style_note=p.get("style_note"))
    if upd:
        db.update_locker(lid, **upd)


@app.post("/api/locker/{lid}/link")
def link_locker(lid: str, payload: dict, x_locker: str = Header(None)):
    """Link a war-table diver (this device's) to the locker."""
    _require_locker(lid, x_locker)
    p = db.get_player(str(payload.get("player_id") or ""))
    if not p or not secrets.compare_digest(p["token"], str(payload.get("player_token") or "")):
        raise HTTPException(403, "not your diver")
    _adopt(lid, p)
    return {"ok": True}


def _record_of(lid):
    """A locker's recorded results (newest first) and the medals in them."""
    record, medals = [], []
    for r in db.locker_record(lid):
        verdicts = _verdicts_of(r.get("verdict_json"))
        row = {"at": r["created_at"], "lobby": r.get("lobby_name"), "lobby_id": r.get("lobby_id"),
               "callsign": r.get("callsign"), "mission": _mission_name(r.get("mission_json")),
               "result": json.loads(r["result_json"]) if r.get("result_json") else {},
               "verdicts": verdicts, "aar": r.get("aar_text") or ""}
        record.append(row)
        for v in verdicts:
            if v and v.get("medal"):
                medals.append({"at": r["created_at"], "medal": v["medal"], "oath": v.get("oath"),
                               "mission": (row["mission"] or {}).get("name")})
    return record, medals


@app.get("/api/locker/{lid}")
def get_locker(lid: str, x_locker: str = Header(None)):
    lk = _require_locker(lid, x_locker)
    snap = json.loads(lk["snapshot_json"]) if lk.get("snapshot_json") else None
    hist = db.locker_stats(lid)
    history = []
    for h in hist:
        d = stats.derive(h["snapshot"])
        history.append({"at": h["at"], "rates": _round(d), "missions": h["snapshot"].get("missions_played"),
                        "kills": h["snapshot"].get("enemy_kills")})
    record, medals = _record_of(lid)
    tables = [{"lobby_id": p["lobby_id"], "callsign": p["callsign"], "joined_at": p.get("joined_at")}
              for p in db.locker_players(lid)][:20]
    return {"id": lid, "callsign": lk.get("callsign") or "", "gear_set": bool(lk.get("gear_set")), "prefs": _prefs_of(lid), "has_pin": bool(lk.get("pin_hash")),
            "owned": _owned_from_json(lk.get("owned_json")) if lk.get("gear_set") else None,
            "play_style": lk.get("play_style"), "style_note": lk.get("style_note"),
            "stats": snap, "scorecard": stats.scorecard(snap) if snap else None,
            "rates": _round(stats.derive(snap)) if snap else None,
            "history": history, "record": record, "medals": medals,
            "loadouts": [_with_armor(o) for o in db.list_loadouts(lid)], "tables": tables,
            "public": bool(lk.get("public", 1) if lk.get("public") is not None else 1)}


def _with_armor(o):
    """Saved kits get their armour's weight + passive, so the locker can draw them like a briefing card."""
    a = next((r for r in loader.items().get("armor", []) if r["name"] == o["kit"].get("armor")), None)
    if a:
        o["kit"] = dict(o["kit"], armor_weight=a.get("weight", ""), armor_passive=a.get("passive", ""))
    return o


@app.post("/api/locker/{lid}/callsign")
def locker_callsign(lid: str, payload: dict, x_locker: str = Header(None)):
    _require_locker(lid, x_locker)
    name = " ".join(str(payload.get("callsign") or "").split())[:24]
    if not name:
        raise HTTPException(400, "callsign can't be empty")
    if any(o["id"] != lid for o in db.lockers_by_callsign(name)):   # callsigns sign people in: one each
        raise HTTPException(409, "another diver already uses that callsign")
    db.update_locker(lid, callsign=name)
    return {"ok": True, "callsign": name}


@app.post("/api/locker/{lid}/gear")
def locker_gear(lid: str, payload: dict, x_locker: str = Header(None)):
    """The locker's gear (same body as a diver's /owned). War tables the diver is in
    within the last day pick it up too."""
    _require_locker(lid, x_locker)
    owned = payload.get("owned", None)
    if owned is not None:
        if not isinstance(owned, list):
            raise HTTPException(400, "owned must be a list or null")
        valid = loader.warbond_catalog()["map"]
        owned = [n for n in owned if isinstance(n, str) and n in valid]
        stored = _owned_store(owned)
    else:
        stored = None
    db.update_locker(lid, owned_json=json.dumps(stored) if stored is not None else None, gear_set=1)
    recent = time.time() - 86400
    for p in db.locker_players(lid):
        if (p.get("joined_at") or 0) >= recent:
            db.set_owned(p["id"], stored)
    return {"ok": True}


@app.post("/api/locker/{lid}/career")
async def locker_career(lid: str, request: Request, images: list[UploadFile] = File(default=[]),
                        x_locker: str = Header(None)):
    """Upload career stats straight to the locker (no war table needed)."""
    lk = _require_locker(lid, x_locker)
    imgs = await _read_images(images)
    if not imgs:
        raise HTTPException(400, "no screenshot provided")
    try:
        _charge(request, "locker:" + lid, 2)
        parsed = await run_in_threadpool(vision.parse_career, imgs, mock_index=0)
    except budget.OverBudget as e:
        return {"ok": False, "vision_error": str(e), "over_budget": True}
    except Exception as e:
        return {"ok": False, "vision_error": str(e)}
    _locker_stats_from(lid, parsed["snapshot"], parsed.get("confidence"), parsed["play_style"], parsed["style_note"])
    if not lk.get("callsign") and parsed.get("callsign"):
        db.update_locker(lid, callsign=parsed["callsign"][:24])
    return {"ok": True, "play_style": parsed["play_style"], "style_note": parsed["style_note"]}


_KIT_KEYS = ("primary", "secondary", "grenade", "armor", "booster")


@app.post("/api/locker/{lid}/loadouts")
def save_loadout(lid: str, payload: dict, x_locker: str = Header(None)):
    """Save a loadout for reference: from a war-table card, or built in the locker."""
    _require_locker(lid, x_locker)
    if len(db.list_loadouts(lid)) >= 60:
        raise HTTPException(400, "locker is full (60 loadouts): delete one first")
    kit, name, note = _clean_kit(payload)
    src = payload.get("source") if isinstance(payload.get("source"), dict) else None
    if src:
        src = {k: str(v)[:80] for k, v in src.items() if k in ("lobby_id", "mission", "mode", "faction", "difficulty")}
    oid = _id(4)
    db.add_loadout(oid, lid, name, kit, note, src)
    return {"ok": True, "id": oid}


def _clean_kit(payload):
    raw = payload.get("kit") or {}
    valid = set(loader.warbond_catalog()["map"]) | {b["name"] for b in loader.items().get("boosters", [])}
    kit = {k: raw.get(k) for k in _KIT_KEYS if isinstance(raw.get(k), str) and raw.get(k) in valid}
    kit["stratagems"] = [n for n in (raw.get("stratagems") or []) if isinstance(n, str) and n in valid][:4]
    if isinstance(raw.get("role"), str):
        kit["role"] = raw["role"][:20]
    if not any(kit.get(k) for k in _KIT_KEYS) and not kit["stratagems"]:
        raise HTTPException(400, "empty loadout")
    name = " ".join(str(payload.get("name") or "").split())[:40] or "Loadout"
    return kit, name, str(payload.get("note") or "")[:400]


@app.post("/api/locker/{lid}/loadouts/{oid}")
def edit_loadout(lid: str, oid: str, payload: dict, x_locker: str = Header(None)):
    """Change a saved loadout: its name, note and kit."""
    _require_locker(lid, x_locker)
    if not any(o["id"] == oid for o in db.list_loadouts(lid)):
        raise HTTPException(404, "loadout not found")
    kit, name, note = _clean_kit(payload)
    db.update_loadout(lid, oid, name, kit, note)
    return {"ok": True, "id": oid}


@app.post("/api/locker/{lid}/loadouts/{oid}/delete")
def delete_loadout(lid: str, oid: str, x_locker: str = Header(None)):
    _require_locker(lid, x_locker)
    db.delete_loadout(lid, oid)
    return {"ok": True}



# ---------------------------------------------------------------- open roster + leaderboard
# Every named locker is listed unless its diver opts out (locker > "Show me on the roster").
# Public view only: callsign, play style, stat rates, medals, saved loadouts. Never the key,
# the gear list or which war tables they're in.
def _public_rates(lk):
    snap = json.loads(lk["snapshot_json"]) if lk.get("snapshot_json") else None
    if not snap:
        return None, None
    d = stats.derive(snap)
    k, deaths = float(snap.get("enemy_kills") or 0), float(snap.get("deaths") or 0)
    m = float(snap.get("missions_played") or 0)
    return snap, {"accuracy": round(d["accuracy"], 4) if snap.get("shots_fired") else None,
                  "kd": round(k / deaths, 2) if deaths else None,
                  "kills_pm": round(k / m, 1) if m else None,
                  "deaths_pm": round(d["deaths_per_mission"], 2) if m else None,
                  "win_rate": round(d["win_rate"], 4) if m else None,
                  "missions": int(m) if m else None}


@app.get("/api/roster")
def roster():
    out = []
    for lk in db.list_public_lockers():
        snap, rates = _public_rates(lk)
        _, medals = _record_of(lk["id"])
        n_res, n_lo = db.locker_counts(lk["id"])
        out.append({"id": lk["id"], "callsign": lk["callsign"], "play_style": lk.get("play_style"),
                    "rates": rates, "medals": len(medals), "results": n_res, "loadouts": n_lo,
                    "active": lk.get("updated_at")})
    return {"divers": out}


@app.get("/api/roster/{lid}")
def roster_profile(lid: str):
    lk = db.get_locker(str(lid)[:40])
    if not lk or lk.get("public") == 0 or not lk.get("callsign"):
        raise HTTPException(404, "diver not found")
    snap, rates = _public_rates(lk)
    record, medals = _record_of(lk["id"])
    hist = [{"at": h["at"], "rates": _round(stats.derive(h["snapshot"])), "missions": h["snapshot"].get("missions_played")}
            for h in db.locker_stats(lk["id"])]
    recent = [{"at": r["at"], "mission": r["mission"], "table": r.get("lobby"), "kills": (r["result"] or {}).get("kills"),
               "accuracy": (r["result"] or {}).get("accuracy_pct"), "medal": next((v["medal"]["name"] for v in r["verdicts"] if v and v.get("medal")), None),
               "deaths": (r["result"] or {}).get("deaths"),
               "oaths": [{"name": v.get("name"), "passed": v.get("passed")} for v in r["verdicts"] if v]}
              for r in record[:10]]
    return {"id": lk["id"], "callsign": lk["callsign"], "play_style": lk.get("play_style"), "rates": rates,
            "scorecard": stats.scorecard(snap) if snap else None, "history": hist, "medals": medals,
            "recent": recent, "loadouts": [_with_armor(o) for o in db.list_loadouts(lk["id"])]}


@app.post("/api/locker/{lid}/prefs")
def locker_prefs(lid: str, payload: dict, x_locker: str = Header(None)):
    _require_locker(lid, x_locker)
    lk = db.get_locker(lid)
    try:
        cur = json.loads(lk["prefs_json"]) if lk and lk.get("prefs_json") else {}
    except Exception:
        cur = {}
    for k, v in (payload or {}).items():   # partial updates: the chat sets four, the armour picker one
        if k in PREF_KEYS and v in PREF_KEYS[k]:
            cur[k] = v
        elif k == "armor_set":
            if v in _ARMOR_NAMES:
                cur[k] = v
            else:
                cur.pop(k, None)
    p = cur
    db.update_locker(lid, prefs_json=json.dumps(p))
    return {"ok": True, "prefs": p}


@app.post("/api/locker/{lid}/visibility")
def locker_visibility(lid: str, payload: dict, x_locker: str = Header(None)):
    _require_locker(lid, x_locker)
    db.update_locker(lid, public=1 if payload.get("public") else 0)
    return {"ok": True}
