"""One-off data cleanup (Nov 10 2026), run once at startup and recorded in kv.

1. Merge the duplicate profiles luciscalue / luciscaluem into the one with more history: seats
   at war tables (and so their results), saved loadouts, stat history, war rooms, awards,
   tables and rooms they created all move over. The kept profile keeps its own PIN, stats and
   settings, and takes the other's where it has none.
2. Remove duplicate scoreboard uploads: the same diver at the same war table with identical
   numbers. The newest copy is kept (with every endorsement); older copies go.
   (Uploads from before mission names were recorded can't tell two missions apart by table
   alone, so only identical numbers count here.)

Everything removed or changed is kept in kv `cleanup_2026_11_10_backup`; what was done is in
kv `cleanup_2026_11_10` and on /health.
"""

from __future__ import annotations

import json
import time

import db

KEY = "cleanup_2026_11_10"
MERGE = [("luciscalue", "luciscaluem")]
NUM_KEYS = ("kills", "deaths", "accuracy_pct", "shots_fired", "shots_hit", "samples_extracted",
            "stratagems_used", "stims_used", "accidentals", "times_reinforcing")


def _kv_get(c, k):
    r = c.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
    return r["v"] if r else None


def _rows(c, sql, args=()):
    return [dict(r) for r in c.execute(sql, args).fetchall()]


def _merge(c, a_name, b_name, backup):
    lks = _rows(c, "SELECT * FROM locker WHERE LOWER(callsign) IN (?,?)", (a_name.lower(), b_name.lower()))
    if len(lks) < 2:
        return None
    def weight(lk):
        n = c.execute("SELECT COUNT(*) FROM result r JOIN player p ON p.id=r.player_id WHERE p.locker_id=?", (lk["id"],)).fetchone()[0]
        return (n, lk.get("updated_at") or 0)
    lks.sort(key=weight, reverse=True)
    keep, gone = lks[0], lks[1:]
    moved = {}
    for g in gone:
        backup["lockers"].append(g)
        s, t = g["id"], keep["id"]
        moved[g["callsign"]] = {
            "seats": c.execute("UPDATE player SET locker_id=? WHERE locker_id=?", (t, s)).rowcount,
            "loadouts": c.execute("UPDATE locker_loadout SET locker_id=? WHERE locker_id=?", (t, s)).rowcount,
            "stat_reads": c.execute("UPDATE locker_stats SET locker_id=? WHERE locker_id=?", (t, s)).rowcount,
            "awards": c.execute("UPDATE award_grant SET locker_id=? WHERE locker_id=?", (t, s)).rowcount,
            "tables_created": c.execute("UPDATE lobby SET creator_locker=? WHERE creator_locker=?", (t, s)).rowcount,
            "rooms_founded": c.execute("UPDATE room SET creator_locker=? WHERE creator_locker=?", (t, s)).rowcount,
        }
        for m in _rows(c, "SELECT * FROM room_member WHERE locker_id=?", (s,)):
            c.execute("INSERT OR IGNORE INTO room_member(room_id,locker_id,joined_at) VALUES(?,?,?)", (m["room_id"], t, m["joined_at"]))
        moved[g["callsign"]]["rooms"] = c.execute("DELETE FROM room_member WHERE locker_id=?", (s,)).rowcount
        # the kept profile takes what it doesn't have yet
        fill = {}
        if not keep.get("pin_hash") and g.get("pin_hash"):
            fill.update(pin_hash=g["pin_hash"], pin_salt=g["pin_salt"])
        if not keep.get("snapshot_json") and g.get("snapshot_json"):
            fill.update(snapshot_json=g["snapshot_json"], confidence_json=g.get("confidence_json"),
                        play_style=g.get("play_style"), style_note=g.get("style_note"))
        if not keep.get("gear_set") and g.get("gear_set"):
            fill.update(owned_json=g.get("owned_json"), gear_set=1)
        try:
            kp = json.loads(keep.get("prefs_json") or "{}")
            gp = json.loads(g.get("prefs_json") or "{}")
            if gp:
                fill["prefs_json"] = json.dumps({**gp, **kp})
        except Exception:
            pass
        if fill:
            c.execute("UPDATE locker SET " + ",".join(f"{k}=?" for k in fill) + ", updated_at=? WHERE id=?",
                      (*fill.values(), time.time(), t))
            keep.update(fill)
        c.execute("DELETE FROM locker WHERE id=?", (s,))
    return {"kept": keep["callsign"], "kept_id": keep["id"], "merged": moved}


def _dedupe(c, backup):
    rows = _rows(c, "SELECT r.*, p.locker_id FROM result r LEFT JOIN player p ON p.id=r.player_id ORDER BY r.created_at DESC")
    groups = {}
    for r in rows:
        try:
            res = json.loads(r["result_json"]) if r.get("result_json") else {}
        except Exception:
            res = {}
        nums = tuple(res.get(k) for k in NUM_KEYS)
        if all(v is None for v in nums[:2]):   # no kills or deaths read: nothing to compare
            continue
        groups.setdefault((r["lobby_id"], r.get("locker_id") or r["player_id"], nums), []).append(r)
    removed = []
    for (_, who, _), rs in groups.items():
        if len(rs) < 2:
            continue
        keep, extra = rs[0], rs[1:]   # newest first
        for x in extra:
            backup["results"].append({k: v for k, v in x.items() if k != "locker_id"})
            for e in _rows(c, "SELECT * FROM endorsement WHERE result_id=?", (x["id"],)):
                backup["endorsements"].append(e)
                c.execute("INSERT OR IGNORE INTO endorsement(result_id,oath,endorser_id,at) VALUES(?,?,?,?)",
                          (keep["id"], e["oath"], e["endorser_id"], e["at"]))
            c.execute("DELETE FROM endorsement WHERE result_id=?", (x["id"],))
            c.execute("DELETE FROM result WHERE id=?", (x["id"],))
            removed.append({"id": x["id"], "lobby": x["lobby_id"], "kept": keep["id"], "at": x["created_at"]})
    return removed


def run() -> dict | None:
    """Once per database. Never raises: a failed cleanup leaves the data as it was."""
    try:
        with db._lock, db._conn() as c:
            done = _kv_get(c, KEY)
            if done:
                return json.loads(done)
            backup = {"lockers": [], "results": [], "endorsements": []}
            c.execute("BEGIN")
            merges = [m for m in (_merge(c, a, b, backup) for a, b in MERGE) if m]
            removed = _dedupe(c, backup)
            report = {"at": time.time(), "merges": merges, "duplicates_removed": len(removed), "removed": removed[:50]}
            c.execute("INSERT OR REPLACE INTO kv(k,v,at) VALUES(?,?,?)", (KEY + "_backup", json.dumps(backup, default=str), time.time()))
            c.execute("INSERT OR REPLACE INTO kv(k,v,at) VALUES(?,?,?)", (KEY, json.dumps(report, default=str), time.time()))
            c.commit()
            return report
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"[:200]}


def status() -> dict | None:
    try:
        with db._lock, db._conn() as c:
            v = _kv_get(c, KEY)
        if not v:
            return None
        r = json.loads(v)
        return {"at": r.get("at"), "merges": r.get("merges"), "duplicates_removed": r.get("duplicates_removed")}
    except Exception:
        return None
