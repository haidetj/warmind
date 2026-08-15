"""SQLite persistence for lobbies. One file, no external service — deploys as a
volume on the host. Raw inputs are stored (mission config, players + snapshots);
loadouts are resolved live so they always reflect the current roster + mission."""

from __future__ import annotations

import json
import os
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
CREATE INDEX IF NOT EXISTS idx_player_lobby ON player(lobby_id);
CREATE INDEX IF NOT EXISTS idx_result_player ON result(player_id);
"""


def init():
    with _lock, _conn() as c:
        c.executescript(SCHEMA)


def create_lobby(lobby_id, name, creator_token):
    now = time.time()
    with _lock, _conn() as c:
        c.execute("INSERT INTO lobby(id,name,creator_token,mission_json,created_at,updated_at)"
                  " VALUES(?,?,?,?,?,?)", (lobby_id, name, creator_token, None, now, now))


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


def save_result(rid, lobby_id, player_id, result: dict, aar_text: str):
    with _lock, _conn() as c:
        c.execute("INSERT INTO result(id,lobby_id,player_id,result_json,aar_text,created_at)"
                  " VALUES(?,?,?,?,?,?)", (rid, lobby_id, player_id, json.dumps(result), aar_text, time.time()))


def latest_result(player_id):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM result WHERE player_id=? ORDER BY created_at DESC LIMIT 1",
                        (player_id,)).fetchone()
        return dict(row) if row else None
