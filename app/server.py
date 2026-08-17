"""WARMIND lobby server.

Raw inputs are stored; loadouts are resolved live so every card reflects the current
roster and mission. Screenshot reading is a model call (vision.py); everything else is
the deterministic resolver you can run offline.
"""

from __future__ import annotations

import json
import os
import secrets

from fastapi import FastAPI, Form, Header, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import pathlib

import db
import vision
from warmind import loader, stats
from warmind.resolve import Player, Session, resolve_squad

HERE = pathlib.Path(__file__).parent
ACCENTS = ["#d7a53a", "#4c9be0", "#2f9e6f", "#c084e8", "#e0574e"]

app = FastAPI(title="WARMIND")
db.init()  # idempotent; also covered by the startup hook for reloads


# ---------------------------------------------------------------- helpers
def _id(n=5):
    return secrets.token_hex(n)


def _mission_from(lobby) -> dict | None:
    return json.loads(lobby["mission_json"]) if lobby and lobby["mission_json"] else None


def _resolve(lobby) -> dict:
    """Live directive for the whole lobby, or players-only if no mission set."""
    players_rows = db.list_players(lobby["id"])
    mission = _mission_from(lobby)
    roster = []
    for i, p in enumerate(players_rows):
        roster.append(Player(
            id=p["id"], callsign=p["callsign"] or f"Diver {i+1}",
            play_style=p["play_style"] or "by_the_book",
            accent_hex=ACCENTS[i % len(ACCENTS)],
        ))
    directive = None
    by_pid = {}
    if mission and mission.get("mission_id") and roster:
        session = Session(
            planet_name=mission.get("planet_name", ""),
            planet_hazards=mission.get("planet_hazards", []),
            mission_id=mission["mission_id"], faction=mission.get("faction", "automatons"),
            difficulty=mission.get("difficulty", 7), mode=mission.get("mode", "improvement"),
            operation_modifiers=mission.get("operation_modifiers", []),
            tactical_objectives=mission.get("tactical_objectives", []),
            is_city_map=mission.get("is_city_map", False),
        )
        d = resolve_squad(session, roster, {})
        by_pid = {a.player_id: a for a in d.assignments}
        directive = {
            "pressure": d.pressure, "matrix": d.capability_matrix,
            "loop": d.loop, "cadence": d.cadence, "reactive": d.reactive_role, "notes": d.notes,
        }

    players_out = []
    for i, p in enumerate(players_rows):
        a = by_pid.get(p["id"])
        res = db.latest_result(p["id"])
        players_out.append({
            "id": p["id"], "callsign": p["callsign"], "accent": ACCENTS[i % len(ACCENTS)],
            "play_style": p["play_style"], "style_source": p["style_source"],
            "style_note": p["style_note"], "has_stats": bool(p["snapshot_json"]),
            "assignment": _assignment_dict(a) if a else None,
            "aar": ({"text": res["aar_text"], "result": json.loads(res["result_json"])} if res else None),
        })
    return {
        "id": lobby["id"], "name": lobby["name"], "mission": mission,
        "players": players_out, "directive": directive,
    }


def _assignment_dict(a):
    return {
        "role": a.role, "primary": a.primary, "secondary": a.secondary, "grenade": a.grenade,
        "armor": a.armor, "armor_weight": a.armor_weight, "armor_passive": a.armor_passive,
        "booster": a.booster, "stratagems": a.stratagems, "growth_slot": a.growth_slot,
        "thin": a.thin, "rationale": a.rationale,
    }


def _media_type(upload: UploadFile) -> str:
    ct = (upload.content_type or "").lower()
    return ct if ct in ("image/png", "image/jpeg", "image/webp", "image/gif") else "image/png"


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
    return {"missions": sorted(missions, key=lambda x: x["name"]),
            "hazards": sorted(hazards, key=lambda x: x["name"]),
            "tacticals": sorted(tacticals, key=lambda x: x["name"]),
            "archetypes": list(stats.ALLOWED), "vision": vision.status()}


# ---------------------------------------------------------------- lobby lifecycle
@app.post("/api/lobby")
def create_lobby(name: str = Form("Squad")):
    lid, token = _id(4), secrets.token_urlsafe(16)
    db.create_lobby(lid, name.strip() or "Squad", token)
    return {"lobby_id": lid, "creator_token": token}


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
    db.set_mission(lid, payload.get("mission") or {})
    return _resolve(db.get_lobby(lid))


@app.post("/api/lobby/{lid}/mission/prefill")
async def mission_prefill(lid: str, image: UploadFile = File(...), x_token: str = Header(None)):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    _require_creator(lobby, x_token)
    data = await image.read()
    try:
        suggestion = vision.parse_mission(data, _media_type(image), [m["id"] for m in loader.missions().values()])
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    return {"suggestion": suggestion}


# ---------------------------------------------------------------- players
@app.post("/api/lobby/{lid}/join")
async def join(lid: str, callsign: str = Form(""), image: UploadFile = File(None)):
    lobby = db.get_lobby(lid)
    if not lobby:
        raise HTTPException(404, "lobby not found")
    pid, token = _id(4), secrets.token_urlsafe(16)
    n_existing = len(db.list_players(lid))
    snapshot, play_style, source, note = None, "by_the_book", "pending", "Pick a style or upload your career stats."
    parsed_call = callsign.strip()
    if image is not None:
        data = await image.read()
        try:
            parsed = vision.parse_career(data, _media_type(image), mock_index=n_existing)
        except Exception as e:
            raise HTTPException(502, f"could not read the screenshot: {e}")
        snapshot = parsed["snapshot"]
        play_style, note, source = parsed["play_style"], parsed["style_note"], "screenshot"
        parsed_call = parsed_call or parsed.get("callsign") or ""
    callsign_final = parsed_call or f"Diver {n_existing + 1}"
    db.add_or_update_player(pid, lid, token, callsign_final, play_style, source, note, snapshot)
    return {"player_id": pid, "player_token": token, "play_style": play_style,
            "style_note": note, "style_source": source}


def _require_player(pid, token):
    p = db.get_player(pid)
    if not p:
        raise HTTPException(404, "player not found")
    if not token or token != p["token"]:
        raise HTTPException(403, "not your diver")
    return p


@app.post("/api/lobby/{lid}/player/{pid}/style")
def set_style(lid: str, pid: str, payload: dict, x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    ps = stats.coerce_play_style(payload.get("play_style"))
    if not ps:
        raise HTTPException(400, "unknown play style")
    db.add_or_update_player(pid, lid, p["token"], p["callsign"], ps, "manual",
                            "Chosen by the diver.", json.loads(p["snapshot_json"]) if p["snapshot_json"] else None)
    return {"ok": True}


@app.post("/api/lobby/{lid}/player/{pid}/career")
async def update_career(lid: str, pid: str, image: UploadFile = File(...), x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    data = await image.read()
    try:
        parsed = vision.parse_career(data, _media_type(image), mock_index=len(db.list_players(lid)))
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    db.add_or_update_player(pid, lid, p["token"], parsed.get("callsign") or p["callsign"],
                            parsed["play_style"], "screenshot", parsed["style_note"], parsed["snapshot"])
    return {"ok": True, "play_style": parsed["play_style"], "style_note": parsed["style_note"],
            "validity": parsed["validity"]}


@app.post("/api/lobby/{lid}/player/{pid}/result")
async def submit_result(lid: str, pid: str, image: UploadFile = File(...), x_token: str = Header(None)):
    p = _require_player(pid, x_token)
    lobby = db.get_lobby(lid)
    state = _resolve(lobby)
    me = next((x for x in state["players"] if x["id"] == pid), None)
    a = me and me["assignment"]
    baseline = stats.derive(json.loads(p["snapshot_json"])) if p["snapshot_json"] else {}
    ctx = {"role": a and a["role"], "play_style": p["play_style"],
           "kit": a and {"primary": a["primary"], "stratagems": a["stratagems"]} or {}, "baseline": baseline}
    data = await image.read()
    try:
        rev = vision.review_results(data, _media_type(image), ctx)
    except Exception as e:
        raise HTTPException(502, f"could not read the screenshot: {e}")
    db.save_result(_id(5), lid, pid, rev["result"], rev["aar_text"])
    return {"ok": True, "aar": rev["aar_text"], "result": rev["result"]}


@app.delete("/api/lobby/{lid}/player/{pid}")
def leave(lid: str, pid: str, x_token: str = Header(None)):
    _require_player(pid, x_token)
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


@app.get("/health")
def health():
    return {"ok": True, "vision": vision.status()}
