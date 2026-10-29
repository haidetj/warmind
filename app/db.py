"""SQLite persistence for lobbies. One file, no external service — deploys as a
volume on the host. Raw inputs are stored (mission config, players + snapshots);
loadouts are resolved live so they always reflect the current roster + mission."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time

DB_PATH = os.environ.get("WARMIND_DB", "/data/warmind.db")
_lock = threading.Lock()


def _conn():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


SCHEMA = """
CREATE TABLE IF NOT EXISTS lobby (
  id TEXT PRIMARY KEY,
  name TEXT,
  creator_token TEXT,
  mission_json TEXT,
  created_at REAL,
  updated_at REAL
);
CREATE TABLE IF NOT EXISTS player (
  id TEXT PRIMARY KEY,
  lobby_id TEXT,
  token TEXT,
  callsign TEXT,
  play_style TEXT,
  style_source TEXT,
  style_note TEXT,
  snapshot_json TEXT,
  joined_at REAL,
  updated_at REAL
);
CREATE TABLE IF NOT EXISTS result (
  id TEXT PRIMARY KEY,
  lobby_id TEXT,
  player_id TEXT,
  result_json TEXT,
  aar_text TEXT,
  created_at REAL
);
CREATE TABLE IF NOT EXISTS callsign_stats (
  callsign_key TEXT PRIMARY KEY,
  callsign TEXT,
  snapshot_json TEXT,
  confidence_json TEXT,
  play_style TEXT,
  style_note TEXT,
  updated_at REAL
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at REAL,
  name TEXT,
  kind TEXT,
  text TEXT,
  lobby_id TEXT,
  page TEXT,
  lang TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_lobby ON player(lobby_id);
CREATE INDEX IF NOT EXISTS idx_result_player ON result(player_id);
"""


def init():
    with _lock, _conn() as c:
        c.executescript(SCHEMA)
        # migration: per-diver gear ownership (added after first deploy)
        cols = {r["name"] for r in c.execute("PRAGMA table_info(player)").fetchall()}
        if "owned_json" not in cols:
            c.execute("ALTER TABLE player ADD COLUMN owned_json TEXT")
        if "confidence_json" not in cols:
            c.execute("ALTER TABLE player ADD COLUMN confidence_json TEXT")
        if "gear_confirmed" not in cols:
            c.execute("ALTER TABLE player ADD COLUMN gear_confirmed INTEGER DEFAULT 0")
        lcols = {r["name"] for r in c.execute("PRAGMA table_info(lobby)").fetchall()}
        if "squad_size" not in lcols:
            c.execute("ALTER TABLE lobby ADD COLUMN squad_size INTEGER")
        if "briefed" not in lcols:
            c.execute("ALTER TABLE lobby ADD COLUMN briefed INTEGER DEFAULT 0")
        if "reroll" not in lcols:
            c.execute("ALTER TABLE lobby ADD COLUMN reroll INTEGER DEFAULT 0")
        if "roster_json" not in lcols:
            c.execute("ALTER TABLE lobby ADD COLUMN roster_json TEXT")
        ccols = {r["name"] for r in c.execute("PRAGMA table_info(callsign_stats)").fetchall()}
        if "owned_json" not in ccols:  # remembered gear: list of owned unlocks, or NULL = owns everything
            c.execute("ALTER TABLE callsign_stats ADD COLUMN owned_json TEXT")
        if "gear_set" not in ccols:
            c.execute("ALTER TABLE callsign_stats ADD COLUMN gear_set INTEGER DEFAULT 0")
        rcols = {r["name"] for r in c.execute("PRAGMA table_info(result)").fetchall()}
        if "verdict_json" not in rcols:
            c.execute("ALTER TABLE result ADD COLUMN verdict_json TEXT")


def set_owned(pid, owned):
    """owned: list of owned non-base item names, or None to mean 'owns everything'.
    Either way the diver has now told us about their gear, so it's confirmed."""
    with _lock, _conn() as c:
        c.execute("UPDATE player SET owned_json=?, gear_confirmed=1, updated_at=? WHERE id=?",
                  (json.dumps(owned) if owned is not None else None, time.time(), pid))


_GENERIC_CALLSIGN = re.compile(r"^diver\s*\d+$")


def callsign_key(callsign: str | None) -> str | None:
    """Normalized key for remembering stats across lobbies, or None for blank /
    generic placeholder names ("Diver 3") that would collide across strangers.
    Callsigns are NOT authenticated — this is a best-effort convenience."""
    k = " ".join((callsign or "").strip().lower().split())
    if not k or _GENERIC_CALLSIGN.match(k):
        return None
    return k


def remember_callsign(callsign, snapshot, confidence, play_style, style_note):
    k = callsign_key(callsign)
    if not k or not snapshot:
        return
    with _lock, _conn() as c:
        c.execute("INSERT INTO callsign_stats(callsign_key,callsign,snapshot_json,confidence_json,play_style,"
                  "style_note,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(callsign_key) DO UPDATE SET "
                  "callsign=excluded.callsign, snapshot_json=excluded.snapshot_json, "
                  "confidence_json=excluded.confidence_json, play_style=excluded.play_style, "
                  "style_note=excluded.style_note, updated_at=excluded.updated_at",
                  (k, callsign.strip(), json.dumps(snapshot), json.dumps(confidence) if confidence else None,
                   play_style, style_note, time.time()))


def remember_gear(callsign, owned):
    """Keep a diver's gear selection with their callsign, so the next war table they
    join starts from it. owned: list of unlock names, or None = owns everything."""
    k = callsign_key(callsign)
    if not k:
        return
    with _lock, _conn() as c:
        c.execute("INSERT INTO callsign_stats(callsign_key,callsign,owned_json,gear_set,updated_at) VALUES(?,?,?,1,?) "
                  "ON CONFLICT(callsign_key) DO UPDATE SET owned_json=excluded.owned_json, gear_set=1, "
                  "updated_at=excluded.updated_at",
                  (k, callsign.strip(), json.dumps(owned) if owned is not None else None, time.time()))


def recall_callsign(callsign):
    k = callsign_key(callsign)
    if not k:
        return None
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM callsign_stats WHERE callsign_key=?", (k,)).fetchone()
        return dict(row) if row else None


def set_briefed(lobby_id, briefed: bool):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET briefed=?, updated_at=? WHERE id=?",
                  (1 if briefed else 0, time.time(), lobby_id))


def lock_roster(lobby_id, player_ids):
    """The divers whose loadouts were generated together. Late joiners are fitted
    around them instead of reshuffling everyone (see server._resolve)."""
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET roster_json=?, briefed=1, updated_at=? WHERE id=?",
                  (json.dumps(list(player_ids)), time.time(), lobby_id))


def bump_reroll(lobby_id) -> int:
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET reroll=COALESCE(reroll,0)+1, updated_at=? WHERE id=?", (time.time(), lobby_id))
        return c.execute("SELECT reroll FROM lobby WHERE id=?", (lobby_id,)).fetchone()["reroll"]


def set_confidence(pid, confidence):
    """confidence: {"verified": [...], "uncertain": [...]} from the double-read, or None."""
    with _lock, _conn() as c:
        c.execute("UPDATE player SET confidence_json=? WHERE id=?",
                  (json.dumps(confidence) if confidence else None, pid))


def create_lobby(lobby_id, name, creator_token, squad_size=4):
    now = time.time()
    with _lock, _conn() as c:
        c.execute("INSERT INTO lobby(id,name,creator_token,mission_json,squad_size,created_at,updated_at)"
                  " VALUES(?,?,?,?,?,?,?)", (lobby_id, name, creator_token, None, squad_size, now, now))


def get_lobby(lobby_id):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM lobby WHERE id=?", (lobby_id,)).fetchone()
        return dict(row) if row else None


def set_mission(lobby_id, mission: dict):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET mission_json=?, updated_at=? WHERE id=?",
                  (json.dumps(mission), time.time(), lobby_id))


def add_or_update_player(pid, lobby_id, token, callsign, play_style, style_source, style_note, snapshot):
    now = time.time()
    with _lock, _conn() as c:
        exists = c.execute("SELECT id FROM player WHERE id=?", (pid,)).fetchone()
        if exists:
            c.execute("UPDATE player SET callsign=?, play_style=?, style_source=?, style_note=?,"
                      " snapshot_json=?, updated_at=? WHERE id=?",
                      (callsign, play_style, style_source, style_note,
                       json.dumps(snapshot) if snapshot else None, now, pid))
        else:
            c.execute("INSERT INTO player(id,lobby_id,token,callsign,play_style,style_source,"
                      "style_note,snapshot_json,joined_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (pid, lobby_id, token, callsign, play_style, style_source, style_note,
                       json.dumps(snapshot) if snapshot else None, now, now))


def get_player(pid):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM player WHERE id=?", (pid,)).fetchone()
        return dict(row) if row else None


def list_players(lobby_id):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM player WHERE lobby_id=? ORDER BY joined_at", (lobby_id,)).fetchall()
        return [dict(r) for r in rows]


def remove_player(pid):
    with _lock, _conn() as c:
        c.execute("DELETE FROM player WHERE id=?", (pid,))


def save_result(rid, lobby_id, player_id, result: dict, aar_text: str, verdict: dict | None = None):
    with _lock, _conn() as c:
        c.execute("INSERT INTO result(id,lobby_id,player_id,result_json,aar_text,verdict_json,created_at)"
                  " VALUES(?,?,?,?,?,?,?)", (rid, lobby_id, player_id, json.dumps(result), aar_text,
                                             json.dumps(verdict) if verdict else None, time.time()))


def latest_result(player_id):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM result WHERE player_id=? ORDER BY created_at DESC LIMIT 1",
                        (player_id,)).fetchone()
        return dict(row) if row else None


# ---------------------------------------------------------------- feedback
def add_feedback(fid, name, kind, text, lobby_id, page, lang):
    """In-app feedback. It's synced daily into public GitHub issues (feedback-sync.yml)."""
    with _lock, _conn() as c:
        c.execute("INSERT INTO feedback(id,created_at,name,kind,text,lobby_id,page,lang) VALUES(?,?,?,?,?,?,?,?)",
                  (fid, time.time(), name, kind, text, lobby_id, page, lang))


def list_feedback(after: float = 0.0, limit: int = 200) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM feedback WHERE created_at > ? ORDER BY created_at LIMIT ?",
                         (after, limit)).fetchall()
    return [dict(r) for r in rows]
