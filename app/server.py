"""WARMIND lobby server.

Raw inputs are stored; loadouts are resolved live so every card reflects the current
roster and mission. Screenshot reading is a model call (vision.py); everything else is
the deterministic resolver you can run offline.
"""

from __future__ import annotations

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
import db
import vision
import war
from warmind import coverage, kitrules, loader, oaths, passives, stats
from warmind.resolve import Player, Session, resolve_squad

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


def _owned_of(p) -> list | None:
    """A player row's owned-gear list, or None meaning 'owns everything'."""
    raw = p.get("owned_json") if isinstance(p, dict) else None
    if not raw:
        return None
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else None
    except Exception:
        return None


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
        taken, d = set(), None
        for gi, grp in enumerate(groups):
            for pl in grp:  # later groups avoid the stratagems the squad already brings
                pl.excluded_items = sorted(taken)
            dg = resolve_squad(_session_of(mission, lobby), grp, {})
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
            "loop": d.loop, "cadence": d.cadence, "reactive": d.reactive_role, "notes": d.notes,
            "swaps": d.swaps, "doctrine": d.doctrine, "notes_i18n": d.notes_i18n,
            # squad redundancy/impact review, each line carrying its research sources
            "review": [dict(r, sources=_RULES.get(r["rule"], {}).get("sources", [])) for r in d.review],
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
            "stats": snap, "rates": rates,   # the numbers read from the screenshots, for verification
            "scorecard": stats.scorecard(snap) if snap else None,  # cool derived display stats
            "confidence": _conf_of(p),       # which read fields were double-read-verified
            "owned": _owned_of(p),           # None = owns everything; else owned non-base gear
            "gear_confirmed": bool(p.get("gear_confirmed")),
            "assignment": _assignment_dict(a) if a else None,
            "aar": ({"text": res["aar_text"], "result": json.loads(res["result_json"]),
                     "verdict": json.loads(res["verdict_json"]) if res.get("verdict_json") else None}
                    if res else None),
        })
    all_snaps = [json.loads(p["snapshot_json"]) for p in players_rows if p["snapshot_json"]]
    return {
        "id": lobby["id"], "name": lobby["name"], "mission": mission,
        "players": players_out, "directive": directive,
        "squad_readout": stats.squad_readout(all_snaps),
        "squad_readout_keys": stats.squad_readout_keys(all_snaps),
        "readiness": readiness, "reroll": int(lobby.get("reroll") or 0),
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


def _round(d: dict) -> dict:
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in (d or {}).items()}


def _assignment_dict(a):
    return {
        "role": a.role, "primary": a.primary, "secondary": a.secondary, "grenade": a.grenade,
        "armor": a.armor, "armor_weight": a.armor_weight, "armor_passive": a.armor_passive,
        "booster": a.booster, "stratagems": a.stratagems, "growth_slot": a.growth_slot,
        "thin": a.thin, "thin_axes": [_AXIS_CODE.get(t, t) for t in a.thin],
        "rationale": a.rationale, "rationale_parts": a.rationale_parts,
    }


_AXIS_CODE = {v: k for k, v in coverage.AXIS_LABEL.items()}  # "heavy armour" -> "at", for the client


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
            "archetypes": list(stats.ALLOWED), "roles": roles, "play_styles": play_styles,
            "warbonds": loader.warbond_catalog()["warbonds"],
            "oaths": oaths.catalog(),
            "wiki": loader.wiki_map(),
            "kit_rules": list(_RULES.values()),
            "armory": loader.armory(),
            "passives": {k: v.get("effect", "") for k, v in passives.table().items()},
            "vision": vision.status()}


@app.get("/api/war")
def war_feed():
    """Active planets + Major Orders from the community war API (cached; no model calls)."""
    return JSONResponse(war.snapshot(), headers={"Cache-Control": "public, max-age=60"})


# ---------------------------------------------------------------- lobby lifecycle
@app.post("/api/lobby")
def create_lobby(name: str = Form("Squad"), squad_size: int = Form(4)):
    lid, token = _id(4), secrets.token_urlsafe(16)
    db.create_lobby(lid, name.strip() or "Squad", token, max(1, min(4, squad_size)))
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
    m = dict(payload.get("mission") or {})
    from warmind.modes import MODES
    if m.get("mode") not in MODES:
        m["mode"] = "improvement"
    if m.get("oath") not in oaths.OATHS:
        m["oath"] = None
    m["planet_name"] = str(m.get("planet_name") or "")[:40]   # picked from the live war feed (display only)
    m["planet_hazards"] = [h for h in (m.get("planet_hazards") or []) if h in loader.hazards()]
    db.set_mission(lid, m)
    if lobby.get("briefed"):  # a new mission regenerates the whole squad, late joiners included
        db.lock_roster(lid, [p["id"] for p in db.list_players(lid)])
    return _resolve(db.get_lobby(lid))


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


# ---------------------------------------------------------------- players
@app.post("/api/lobby/{lid}/join")
async def join(lid: str, request: Request, callsign: str = Form(""), images: list[UploadFile] = File(default=[])):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    pid, token = _id(4), secrets.token_urlsafe(16)
    n_existing = len(db.list_players(lid))
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
    callsign_final = parsed_call or f"Diver {n_existing + 1}"
    db.add_or_update_player(pid, lid, token, callsign_final, play_style, source, note, snapshot)
    if confidence:
        db.set_confidence(pid, confidence)
    if source == "screenshot":
        db.remember_callsign(callsign_final, snapshot, confidence, play_style, note)
    # remembered gear: a returning callsign starts from the gear they set last time
    gear_restored = None
    mem = db.recall_callsign(callsign_final)
    if mem and mem.get("gear_set"):
        owned = json.loads(mem["owned_json"]) if mem.get("owned_json") else None
        if owned is not None:  # drop names that no longer exist in the catalog
            valid = set(loader.warbond_catalog()["map"].keys())
            owned = [n for n in owned if n in valid]
        db.set_owned(pid, owned)
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


@app.post("/api/lobby/{lid}/player/{pid}/owned")
def set_owned(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    """Set which non-base gear this diver owns. Body: {"owned": [name,...]} or
    {"owned": null} to mean 'owns everything'. Loadouts then avoid unowned gear."""
    p = _require_player(pid, x_token)
    owned = payload.get("owned", None)
    if owned is not None:
        if not isinstance(owned, list):
            raise HTTPException(400, "owned must be a list or null")
        valid = set(loader.warbond_catalog()["map"].keys())
        owned = [n for n in owned if isinstance(n, str) and n in valid]
    db.set_owned(pid, owned)
    db.remember_gear(p["callsign"], owned)  # the next war table under this callsign starts from it
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
    # the oath verdict is decided in code from the numbers, before any prose is written
    verdict = oaths.evaluate(mission.get("oath"), result)
    if verdict:
        verdict["medal"] = oaths.medal(verdict, lobby_id=lid, player_id=pid, result=result,
                                       mode=mission.get("mode"))
    try:
        aar = await run_in_threadpool(vision.write_aar, data, mt, result, ctx, verdict, lang=lang)
    except Exception:
        # the numbers and verdict already stand; don't lose them over the prose call
        aar = vision._mock_oath_line(verdict) + "Review text unavailable — the scoreboard was read and recorded."
    db.save_result(_id(5), lid, pid, result, aar, verdict)
    return {"ok": True, "aar": aar, "result": result, "verdict": verdict}


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
    return {"ok": True, "vision": vision.status(), "budget": budget.status(), "war": war.status()}
