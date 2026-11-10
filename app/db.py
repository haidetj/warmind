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
CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at REAL,
  kind TEXT,
  model TEXT,
  lobby_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read INTEGER,
  cache_write INTEGER,
  cost_usd REAL
);
CREATE TABLE IF NOT EXISTS room_award (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  name TEXT,
  description TEXT,
  icon TEXT,
  created_at REAL,
  retired INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS award_grant (
  id TEXT PRIMARY KEY,
  award_id TEXT,
  room_id TEXT,
  locker_id TEXT,
  note TEXT,
  granted_at REAL
);
CREATE INDEX IF NOT EXISTS award_grant_locker ON award_grant(locker_id);
CREATE TABLE IF NOT EXISTS endorsement (
  result_id TEXT,
  oath TEXT,
  endorser_id TEXT,
  at REAL,
  PRIMARY KEY (result_id, oath, endorser_id)
);
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT,
  at REAL
);
CREATE TABLE IF NOT EXISTS room (
  id TEXT PRIMARY KEY,
  name TEXT,
  ship TEXT,
  creator_token TEXT,
  mission_json TEXT,
  mission_by TEXT,
  created_at REAL,
  updated_at REAL
);
CREATE TABLE IF NOT EXISTS room_order (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  kind TEXT,
  title TEXT,
  target INTEGER,
  params_json TEXT,
  set_by TEXT,
  done_at REAL,
  retired INTEGER DEFAULT 0,
  created_at REAL
);
CREATE TABLE IF NOT EXISTS room_member (
  room_id TEXT,
  locker_id TEXT,
  joined_at REAL,
  PRIMARY KEY (room_id, locker_id)
);
CREATE TABLE IF NOT EXISTS room_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT,
  kind TEXT,
  text TEXT,
  at REAL
);
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
CREATE TABLE IF NOT EXISTS feedback_image (
  feedback_id TEXT,
  n INTEGER,
  data BLOB,
  PRIMARY KEY (feedback_id, n)
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
CREATE TABLE IF NOT EXISTS locker (
  id TEXT PRIMARY KEY,
  key TEXT,
  callsign TEXT,
  owned_json TEXT,
  gear_set INTEGER DEFAULT 0,
  snapshot_json TEXT,
  confidence_json TEXT,
  play_style TEXT,
  style_note TEXT,
  created_at REAL,
  updated_at REAL
);
CREATE TABLE IF NOT EXISTS locker_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locker_id TEXT,
  at REAL,
  snapshot_json TEXT,
  source TEXT
);
CREATE TABLE IF NOT EXISTS locker_loadout (
  id TEXT PRIMARY KEY,
  locker_id TEXT,
  name TEXT,
  kit_json TEXT,
  note TEXT,
  source_json TEXT,
  created_at REAL
);
CREATE INDEX IF NOT EXISTS idx_lstats ON locker_stats(locker_id);
CREATE INDEX IF NOT EXISTS idx_lload ON locker_loadout(locker_id);
CREATE TABLE IF NOT EXISTS plan (
  lobby_id TEXT,
  sig TEXT,
  created_at REAL,
  status TEXT,
  plan_json TEXT,
  PRIMARY KEY (lobby_id, sig)
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
        if "folded" not in lcols:   # the creator folded (closed) the table, done or not
            c.execute("ALTER TABLE lobby ADD COLUMN folded REAL")
        rcols = {r["name"] for r in c.execute("PRAGMA table_info(room)").fetchall()}
        if "creator_locker" not in rcols:   # the founder's profile: founder rights on any device
            c.execute("ALTER TABLE room ADD COLUMN creator_locker TEXT")
        if "message" not in rcols:          # the founder's pinned message to the crew
            c.execute("ALTER TABLE room ADD COLUMN message TEXT")
            c.execute("ALTER TABLE room ADD COLUMN message_at REAL")
        if "creator_locker" not in lcols:   # whose profile created this table (creator rights on any device)
            c.execute("ALTER TABLE lobby ADD COLUMN creator_locker TEXT")
        if "room_id" not in lcols:   # the war room this table belongs to
            c.execute("ALTER TABLE lobby ADD COLUMN room_id TEXT")
        if "go" not in cols:          # Go / No-Go poll before the drop
            c.execute("ALTER TABLE player ADD COLUMN go INTEGER DEFAULT 0")
        ccols = {r["name"] for r in c.execute("PRAGMA table_info(callsign_stats)").fetchall()}
        if "owned_json" not in ccols:  # remembered gear: list of owned unlocks, or NULL = owns everything
            c.execute("ALTER TABLE callsign_stats ADD COLUMN owned_json TEXT")
        if "gear_set" not in ccols:
            c.execute("ALTER TABLE callsign_stats ADD COLUMN gear_set INTEGER DEFAULT 0")
        lkcols = {r["name"] for r in c.execute("PRAGMA table_info(locker)").fetchall()}
        if "public" not in lkcols:    # listed on the open roster / leaderboard (the diver can opt out)
            c.execute("ALTER TABLE locker ADD COLUMN public INTEGER DEFAULT 1")
        if "prefs_json" not in lkcols:   # what the diver told WARMIND in the profile chat
            c.execute("ALTER TABLE locker ADD COLUMN prefs_json TEXT")
        if "pin_hash" not in lkcols:     # callsign + PIN signs a profile in on any device
            c.execute("ALTER TABLE locker ADD COLUMN pin_hash TEXT")
            c.execute("ALTER TABLE locker ADD COLUMN pin_salt TEXT")
        if "locker_id" not in cols:   # the diver's locker (gear, stat history, record), if linked
            c.execute("ALTER TABLE player ADD COLUMN locker_id TEXT")
        rcols = {r["name"] for r in c.execute("PRAGMA table_info(result)").fetchall()}
        if "verdict_json" not in rcols:
            c.execute("ALTER TABLE result ADD COLUMN verdict_json TEXT")
        if "lesson" not in rcols:       # the debrief's one-line kit lesson, carried into the next kit
            c.execute("ALTER TABLE result ADD COLUMN lesson TEXT")
        if "loadout_id" not in rcols:   # the saved loadout the diver fought with, if any
            c.execute("ALTER TABLE result ADD COLUMN loadout_id TEXT")
        if "kit_choice" not in cols:    # a saved loadout the diver chose to fight with at this table
            c.execute("ALTER TABLE player ADD COLUMN kit_choice TEXT")
        if "kit_edits" not in cols:     # quick swaps on this table's kit: {slot or "strat:<old>": item}
            c.execute("ALTER TABLE player ADD COLUMN kit_edits TEXT")


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
        c.execute("UPDATE player SET kit_edits=NULL WHERE lobby_id=?", (lobby_id,))   # a reroll: quick swaps start over
        return c.execute("SELECT reroll FROM lobby WHERE id=?", (lobby_id,)).fetchone()["reroll"]


def set_confidence(pid, confidence):
    """confidence: {"verified": [...], "uncertain": [...]} from the double-read, or None."""
    with _lock, _conn() as c:
        c.execute("UPDATE player SET confidence_json=? WHERE id=?",
                  (json.dumps(confidence) if confidence else None, pid))


def set_squad_size(lobby_id, n):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET squad_size=?, updated_at=? WHERE id=?", (n, time.time(), lobby_id))


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
        old = c.execute("SELECT mission_json FROM lobby WHERE id=?", (lobby_id,)).fetchone()
        c.execute("UPDATE lobby SET mission_json=?, updated_at=? WHERE id=?",
                  (json.dumps(mission), time.time(), lobby_id))
        if not old or (old["mission_json"] or "") != json.dumps(mission):   # new kits: quick swaps start over
            c.execute("UPDATE player SET kit_edits=NULL WHERE lobby_id=?", (lobby_id,))


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


def save_result(rid, lobby_id, player_id, result: dict, aar_text: str, verdict: dict | None = None,
                lesson: str | None = None, loadout_id: str | None = None):
    with _lock, _conn() as c:
        c.execute("INSERT INTO result(id,lobby_id,player_id,result_json,aar_text,verdict_json,created_at,lesson,loadout_id)"
                  " VALUES(?,?,?,?,?,?,?,?,?)", (rid, lobby_id, player_id, json.dumps(result), aar_text,
                                                 json.dumps(verdict) if verdict else None, time.time(), lesson, loadout_id))


def player_results(player_id):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM result WHERE player_id=? ORDER BY created_at DESC", (player_id,)).fetchall()
    return [dict(r) for r in rows]


def delete_result(rid):
    """A re-upload of the same mission replaces the earlier read (and its endorsements)."""
    with _lock, _conn() as c:
        c.execute("DELETE FROM endorsement WHERE result_id=?", (rid,))
        c.execute("DELETE FROM result WHERE id=?", (rid,))


def locker_lessons(locker_id, limit=3):
    """The latest kit lessons from this diver's debriefs (newest first)."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT r.lesson, r.created_at FROM result r JOIN player p ON p.id=r.player_id "
                         "WHERE p.locker_id=? AND COALESCE(r.lesson,'')<>'' ORDER BY r.created_at DESC LIMIT ?",
                         (locker_id, limit)).fetchall()
    return [dict(r) for r in rows]


def set_kit_choice(pid, loadout_id):
    with _lock, _conn() as c:
        c.execute("UPDATE player SET kit_choice=?, kit_edits=NULL, updated_at=? WHERE id=?", (loadout_id, time.time(), pid))


def set_kit_edits(pid, edits: dict | None):
    with _lock, _conn() as c:
        c.execute("UPDATE player SET kit_edits=?, updated_at=? WHERE id=?", (json.dumps(edits) if edits else None, time.time(), pid))


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


def add_feedback_image(fid, n, data: bytes):
    with _lock, _conn() as c:
        c.execute("INSERT OR REPLACE INTO feedback_image(feedback_id,n,data) VALUES(?,?,?)", (fid, n, data))


def feedback_image(fid, n):
    with _lock, _conn() as c:
        r = c.execute("SELECT data FROM feedback_image WHERE feedback_id=? AND n=?", (fid, n)).fetchone()
    return bytes(r["data"]) if r else None


def feedback_image_counts(fids) -> dict:
    if not fids:
        return {}
    with _lock, _conn() as c:
        rows = c.execute("SELECT feedback_id, COUNT(*) AS n FROM feedback_image WHERE feedback_id IN (%s) GROUP BY feedback_id"
                         % ",".join("?" * len(fids)), list(fids)).fetchall()
    return {r["feedback_id"]: r["n"] for r in rows}


def get_feedback(fid):
    with _lock, _conn() as c:
        r = c.execute("SELECT * FROM feedback WHERE id=?", (fid,)).fetchone()
    return dict(r) if r else None


def list_feedback(after: float = 0.0, limit: int = 200) -> list:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM feedback WHERE created_at > ? ORDER BY created_at LIMIT ?",
                         (after, limit)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- WARMIND's thought-out plans
def put_plan(lobby_id, sig, status, plan):
    """The planner's result for one exact set of inputs (sig): ready / failed."""
    with _lock, _conn() as c:
        c.execute("INSERT OR REPLACE INTO plan(lobby_id,sig,created_at,status,plan_json) VALUES(?,?,?,?,?)",
                  (lobby_id, sig, time.time(), status, json.dumps(plan)))
        # keep the last few per lobby (rerolls make new ones)
        c.execute("DELETE FROM plan WHERE lobby_id=? AND sig NOT IN "
                  "(SELECT sig FROM plan WHERE lobby_id=? ORDER BY created_at DESC LIMIT 12)", (lobby_id, lobby_id))


def get_plan(lobby_id, sig):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM plan WHERE lobby_id=? AND sig=?", (lobby_id, sig)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["plan"] = json.loads(d.pop("plan_json") or "null")
    return d


# ---------------------------------------------------------------- lockers
# A diver's own page across war tables: gear, stat history, record, saved loadouts.
# No accounts: the locker id + a secret key live on the diver's device (and in a
# private link they can open on another device).
def create_locker(lid, key, callsign):
    now = time.time()
    with _lock, _conn() as c:
        c.execute("INSERT INTO locker(id,key,callsign,created_at,updated_at) VALUES(?,?,?,?,?)",
                  (lid, key, callsign, now, now))


def get_locker(lid):
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM locker WHERE id=?", (lid,)).fetchone()
    return dict(row) if row else None


def update_locker(lid, **fields):
    allowed = {"callsign", "owned_json", "gear_set", "snapshot_json", "confidence_json", "play_style", "style_note", "public", "prefs_json", "pin_hash", "pin_salt"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return
    sets["updated_at"] = time.time()
    with _lock, _conn() as c:
        c.execute("UPDATE locker SET " + ",".join(f"{k}=?" for k in sets) + " WHERE id=?", (*sets.values(), lid))


def add_locker_stats(lid, snapshot, source):
    """Append a stat read to the locker's history (skips an identical repeat)."""
    blob = json.dumps(snapshot, sort_keys=True)
    with _lock, _conn() as c:
        last = c.execute("SELECT snapshot_json FROM locker_stats WHERE locker_id=? ORDER BY at DESC LIMIT 1",
                         (lid,)).fetchone()
        if last and last["snapshot_json"] == blob:
            return
        c.execute("INSERT INTO locker_stats(locker_id,at,snapshot_json,source) VALUES(?,?,?,?)",
                  (lid, time.time(), blob, source))


def locker_stats(lid, limit=60):
    with _lock, _conn() as c:
        rows = c.execute("SELECT at, snapshot_json, source FROM locker_stats WHERE locker_id=? ORDER BY at DESC LIMIT ?",
                         (lid, limit)).fetchall()
    return [{"at": r["at"], "snapshot": json.loads(r["snapshot_json"]), "source": r["source"]} for r in rows]


def add_loadout(oid, lid, name, kit, note, source):
    with _lock, _conn() as c:
        c.execute("INSERT INTO locker_loadout(id,locker_id,name,kit_json,note,source_json,created_at) VALUES(?,?,?,?,?,?,?)",
                  (oid, lid, name, json.dumps(kit), note, json.dumps(source) if source else None, time.time()))


def update_loadout(lid, oid, name, kit, note):
    with _lock, _conn() as c:
        c.execute("UPDATE locker_loadout SET name=?, kit_json=?, note=? WHERE id=? AND locker_id=?",
                  (name, json.dumps(kit), note, oid, lid))


def delete_loadout(lid, oid):
    with _lock, _conn() as c:
        c.execute("DELETE FROM locker_loadout WHERE id=? AND locker_id=?", (oid, lid))


def list_loadouts(lid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM locker_loadout WHERE locker_id=? ORDER BY created_at DESC", (lid,)).fetchall()
    return [{"id": r["id"], "name": r["name"], "kit": json.loads(r["kit_json"]), "note": r["note"] or "",
             "source": json.loads(r["source_json"]) if r["source_json"] else None, "created_at": r["created_at"]}
            for r in rows]


def link_player_locker(pid, lid):
    with _lock, _conn() as c:
        c.execute("UPDATE player SET locker_id=? WHERE id=?", (lid, pid))


def locker_players(lid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM player WHERE locker_id=? ORDER BY joined_at DESC", (lid,)).fetchall()
    return [dict(r) for r in rows]


def locker_record(lid, limit=100):
    """Every recorded result of every diver linked to this locker, newest first, with the war table."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT r.*, l.name AS lobby_name, l.mission_json AS mission_json, p.callsign AS callsign "
                         "FROM result r JOIN player p ON p.id=r.player_id LEFT JOIN lobby l ON l.id=r.lobby_id "
                         "WHERE p.locker_id=? ORDER BY r.created_at DESC LIMIT ?", (lid, limit)).fetchall()
    return [dict(r) for r in rows]


def list_public_lockers(limit=300):
    """Lockers on the open roster: named, public, newest activity first."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM locker WHERE COALESCE(public,1)=1 AND COALESCE(callsign,'')<>'' "
                         "ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def locker_counts(lid):
    with _lock, _conn() as c:
        res = c.execute("SELECT COUNT(*) n FROM result r JOIN player p ON p.id=r.player_id WHERE p.locker_id=?", (lid,)).fetchone()["n"]
        lo = c.execute("SELECT COUNT(*) n FROM locker_loadout WHERE locker_id=?", (lid,)).fetchone()["n"]
    return res, lo


# ---------------------------------------------------------------- war rooms
def create_room(rid, name, ship, token):
    now = time.time()
    with _lock, _conn() as c:
        c.execute("INSERT INTO room(id,name,ship,creator_token,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                  (rid, name, ship, token, now, now))


def get_room(rid):
    with _lock, _conn() as c:
        r = c.execute("SELECT * FROM room WHERE id=?", (rid,)).fetchone()
    return dict(r) if r else None


def update_room(rid, **kw):
    allowed = {k: v for k, v in kw.items() if k in ("name", "ship", "mission_json", "mission_by", "creator_locker", "message", "message_at")}
    if not allowed:
        return
    sets = ",".join(f"{k}=?" for k in allowed)
    with _lock, _conn() as c:
        c.execute(f"UPDATE room SET {sets}, updated_at=? WHERE id=?", (*allowed.values(), time.time(), rid))


def room_lobbies(rid, limit=60):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM lobby WHERE room_id=? ORDER BY created_at DESC LIMIT ?", (rid, limit)).fetchall()
    return [dict(r) for r in rows]


def set_lobby_room(lid, rid):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET room_id=?, updated_at=? WHERE id=?", (rid, time.time(), lid))


def room_results(rid):
    """Every recorded result in the room's war tables, oldest first, with the table's mission."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT r.*, l.mission_json AS mission_json, p.callsign AS callsign FROM result r "
                         "JOIN lobby l ON l.id=r.lobby_id LEFT JOIN player p ON p.id=r.player_id "
                         "WHERE l.room_id=? ORDER BY r.created_at", (rid,)).fetchall()
    return [dict(r) for r in rows]


def add_room_order(oid, rid, kind, title, target, params, set_by):
    with _lock, _conn() as c:
        c.execute("INSERT INTO room_order(id,room_id,kind,title,target,params_json,set_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
                  (oid, rid, kind, title, target, json.dumps(params or {}), set_by, time.time()))


def room_orders(rid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM room_order WHERE room_id=? AND COALESCE(retired,0)=0 ORDER BY created_at", (rid,)).fetchall()
    return [dict(r) for r in rows]


def update_room_order(oid, rid, **kw):
    allowed = {k: v for k, v in kw.items() if k in ("done_at", "retired")}
    if not allowed:
        return
    sets = ",".join(f"{k}=?" for k in allowed)
    with _lock, _conn() as c:
        c.execute(f"UPDATE room_order SET {sets} WHERE id=? AND room_id=?", (*allowed.values(), oid, rid))


def add_room_member(rid, locker_id):
    with _lock, _conn() as c:
        c.execute("INSERT OR IGNORE INTO room_member(room_id,locker_id,joined_at) VALUES(?,?,?)", (rid, locker_id, time.time()))


def room_members(rid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT m.locker_id, m.joined_at, k.callsign, k.play_style, COALESCE(k.public,1) AS public FROM room_member m "
                         "LEFT JOIN locker k ON k.id=m.locker_id WHERE m.room_id=? ORDER BY m.joined_at", (rid,)).fetchall()
    return [dict(r) for r in rows]


def locker_rooms(locker_id):
    with _lock, _conn() as c:
        rows = c.execute("SELECT r.* FROM room r JOIN room_member m ON m.room_id=r.id WHERE m.locker_id=? "
                         "ORDER BY r.updated_at DESC", (locker_id,)).fetchall()
    return [dict(r) for r in rows]


def room_log(rid, kind, text):
    with _lock, _conn() as c:
        c.execute("INSERT INTO room_log(room_id,kind,text,at) VALUES(?,?,?,?)", (rid, kind, text, time.time()))
        c.execute("UPDATE room SET updated_at=? WHERE id=?", (time.time(), rid))


def room_log_list(rid, limit=40):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM room_log WHERE room_id=? ORDER BY at DESC, id DESC LIMIT ?", (rid, limit)).fetchall()
    return [dict(r) for r in rows]


def set_player_go(pid, go):
    with _lock, _conn() as c:
        c.execute("UPDATE player SET go=?, updated_at=? WHERE id=?", (1 if go else 0, time.time(), pid))


def public_locker_by_callsign(callsign):
    """The newest public profile with this callsign (a returning diver on a new device)."""
    with _lock, _conn() as c:
        r = c.execute("SELECT * FROM locker WHERE COALESCE(public,1)=1 AND lower(callsign)=lower(?) AND snapshot_json IS NOT NULL "
                      "ORDER BY updated_at DESC LIMIT 1", (callsign,)).fetchone()
    return dict(r) if r else None


# ---------------------------------------------------------------- what Claude costs
def add_usage(kind, model, lobby_id, inp, out, cread, cwrite, cost):
    with _lock, _conn() as c:
        c.execute("INSERT INTO api_usage(at,kind,model,lobby_id,input_tokens,output_tokens,cache_read,cache_write,cost_usd)"
                  " VALUES(?,?,?,?,?,?,?,?,?)", (time.time(), kind, model, lobby_id, inp, out, cread, cwrite, cost))


def usage_since(ts):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM api_usage WHERE at>=? ORDER BY at", (ts,)).fetchall()
    return [dict(r) for r in rows]


def put_cost_report(text):
    with _lock, _conn() as c:
        c.execute("INSERT OR REPLACE INTO kv(k,v,at) VALUES('cost_report',?,?)", (text, time.time()))


def get_cost_report():
    with _lock, _conn() as c:
        r = c.execute("SELECT v FROM kv WHERE k='cost_report'").fetchone()
    return r["v"] if r else None


# ---------------------------------------------------------------- sign in (callsign + PIN)
def lockers_by_callsign(callsign):
    """Profiles with this callsign, best match first: a PIN set, then most recently used."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM locker WHERE lower(callsign)=lower(?) ORDER BY (pin_hash IS NOT NULL) DESC, "
                         "updated_at DESC", (callsign,)).fetchall()
    return [dict(r) for r in rows]


def set_lobby_creator_locker(lobby_id, locker_id):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET creator_locker=? WHERE id=?", (locker_id, lobby_id))


def locker_tables(locker_id, limit=40):
    """War tables this profile created or sat at, newest first, with its seat (player id + token) if any."""
    with _lock, _conn() as c:
        rows = c.execute(
            "SELECT l.id AS lobby_id, l.creator_token AS creator_token, (l.creator_locker=?) AS mine, "
            "p.id AS player_id, p.token AS player_token, l.updated_at AS updated_at FROM lobby l "
            "LEFT JOIN player p ON p.lobby_id=l.id AND p.locker_id=? "
            "WHERE l.creator_locker=? OR p.locker_id=? ORDER BY l.updated_at DESC LIMIT ?",
            (locker_id, locker_id, locker_id, locker_id, limit)).fetchall()
    return [dict(r) for r in rows]


def lobby_has_results(lobby_id) -> bool:
    with _lock, _conn() as c:
        return c.execute("SELECT 1 FROM result WHERE lobby_id=? LIMIT 1", (lobby_id,)).fetchone() is not None


# ---------------------------------------------------------------- oath endorsements
def add_endorsement(result_id, oath, endorser_id):
    with _lock, _conn() as c:
        c.execute("INSERT OR IGNORE INTO endorsement(result_id,oath,endorser_id,at) VALUES(?,?,?,?)",
                  (result_id, oath, endorser_id, time.time()))


def endorsements(result_id):
    """{oath: [endorser player ids]}"""
    with _lock, _conn() as c:
        rows = c.execute("SELECT oath, endorser_id FROM endorsement WHERE result_id=? ORDER BY at", (result_id,)).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["oath"], []).append(r["endorser_id"])
    return out


def fix_result(result_id, result: dict, verdicts):
    with _lock, _conn() as c:
        c.execute("UPDATE result SET result_json=?, verdict_json=? WHERE id=?",
                  (json.dumps(result), json.dumps(verdicts) if verdicts else None, result_id))


def set_result_verdicts(result_id, verdicts):
    with _lock, _conn() as c:
        c.execute("UPDATE result SET verdict_json=? WHERE id=?", (json.dumps(verdicts), result_id))


def set_lobby_folded(lobby_id, folded: bool):
    with _lock, _conn() as c:
        c.execute("UPDATE lobby SET folded=?, updated_at=? WHERE id=?", (time.time() if folded else None, time.time(), lobby_id))


def lobby_debriefed(lobby_id) -> set:
    """Player ids at this table with a recorded debrief."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT DISTINCT player_id FROM result WHERE lobby_id=?", (lobby_id,)).fetchall()
    return {r["player_id"] for r in rows}


def remove_room_member(rid, locker_id):
    with _lock, _conn() as c:
        c.execute("DELETE FROM room_member WHERE room_id=? AND locker_id=?", (rid, locker_id))


# ---------------------------------------------------------------- Discord pickers
def recent_lobbies(since, q="", limit=25):
    """War tables touched since `since`, newest first, optionally matching a name / code."""
    like = f"%{q}%"
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM lobby WHERE updated_at>=? AND (name LIKE ? OR id LIKE ?) AND COALESCE(folded,0)=0 "
                         "ORDER BY updated_at DESC LIMIT ?", (since, like, like, limit)).fetchall()
    return [dict(r) for r in rows]


def find_rooms(q="", limit=25):
    like = f"%{q}%"
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM room WHERE name LIKE ? OR id LIKE ? ORDER BY updated_at DESC LIMIT ?",
                         (like, like, limit)).fetchall()
    return [dict(r) for r in rows]


def find_public_lockers(q="", limit=25):
    like = f"%{q}%"
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, callsign FROM locker WHERE callsign IS NOT NULL AND COALESCE(public,1)!=0 AND callsign LIKE ? "
                         "ORDER BY updated_at DESC LIMIT ?", (like, limit)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- awards the room's founder names
def add_award(aid, rid, name, description, icon):
    with _lock, _conn() as c:
        c.execute("INSERT INTO room_award(id,room_id,name,description,icon,created_at,retired) VALUES(?,?,?,?,?,?,0)",
                  (aid, rid, name, description, icon, time.time()))


def update_award(aid, rid, **kw):
    allowed = {k: v for k, v in kw.items() if k in ("name", "description", "icon", "retired")}
    if allowed:
        sets = ",".join(f"{k}=?" for k in allowed)
        with _lock, _conn() as c:
            c.execute(f"UPDATE room_award SET {sets} WHERE id=? AND room_id=?", (*allowed.values(), aid, rid))


def room_awards(rid, include_retired=False):
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM room_award WHERE room_id=?" + ("" if include_retired else " AND COALESCE(retired,0)=0")
                         + " ORDER BY created_at", (rid,)).fetchall()
    return [dict(r) for r in rows]


def get_award(aid, rid):
    with _lock, _conn() as c:
        r = c.execute("SELECT * FROM room_award WHERE id=? AND room_id=?", (aid, rid)).fetchone()
    return dict(r) if r else None


def add_grant(gid, aid, rid, locker_id, note):
    with _lock, _conn() as c:
        c.execute("INSERT INTO award_grant(id,award_id,room_id,locker_id,note,granted_at) VALUES(?,?,?,?,?,?)",
                  (gid, aid, rid, locker_id, note, time.time()))


def remove_grant(gid, rid):
    with _lock, _conn() as c:
        r = c.execute("SELECT * FROM award_grant WHERE id=? AND room_id=?", (gid, rid)).fetchone()
        c.execute("DELETE FROM award_grant WHERE id=? AND room_id=?", (gid, rid))
    return dict(r) if r else None


def room_grants(rid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT g.*, k.callsign, COALESCE(k.public,1) AS public FROM award_grant g LEFT JOIN locker k ON k.id=g.locker_id "
                         "WHERE g.room_id=? ORDER BY g.granted_at", (rid,)).fetchall()
    return [dict(r) for r in rows]


def locker_awards(locker_id):
    """Every award a diver holds, newest first, with the award and its room."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT g.id, g.note, g.granted_at, a.id AS award_id, a.name, a.description, a.icon, r.id AS room_id, r.name AS room_name "
                         "FROM award_grant g JOIN room_award a ON a.id=g.award_id LEFT JOIN room r ON r.id=g.room_id "
                         "WHERE g.locker_id=? ORDER BY g.granted_at DESC", (locker_id,)).fetchall()
    return [dict(r) for r in rows]
