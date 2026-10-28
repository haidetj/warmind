"""Live Galactic War feed: active planets and Major Orders.

Reads the community Helldivers 2 API (api.helldivers2.dev, the one the companion
apps use). No Claude calls, no cost. Responses are cached for CACHE_S, so the API
sees at most one request per endpoint every few minutes however many squads are
looking. If the API is down, the last good snapshot is served (marked stale) for
up to STALE_S, then the feature quietly hides itself.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.request

from warmind import loader

BASE = "https://api.helldivers2.dev/api/v1/"
HEADERS = {"X-Super-Client": "warmind (github.com/haidetj/warmind)",
           "X-Super-Contact": "github.com/haidetj/warmind/issues",
           "Accept": "application/json", "User-Agent": "warmind"}
CACHE_S = 300
STALE_S = 6 * 3600
TIMEOUT_S = 6

FACTIONS = {"terminids": "terminids", "automaton": "automatons", "automatons": "automatons",
            "illuminate": "illuminate"}

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "ok_at": 0.0, "data": None, "error": None}


def _get(path: str):
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", (s or "").lower())


def _hazard_index() -> dict:
    """Wiki/API hazard name -> our hazard id ("Ion Storms" -> ion_storms)."""
    idx = {}
    for hid, h in loader.hazards().items():
        for name in (h.get("display_name", ""), hid):
            n = _norm(name)
            idx[n] = hid
            idx[n.rstrip("s")] = hid
    return idx


def _faction(name) -> str | None:
    return FACTIONS.get(_norm(name or ""))


def _planets(campaigns: list, mo_planets: set) -> list:
    hz = _hazard_index()
    out = []
    for c in campaigns or []:
        p = c.get("planet") or {}
        ev = p.get("event") or None
        # A defence campaign is on a planet we own; the enemy is whoever is attacking it.
        enemy = _faction((ev or {}).get("faction")) if ev else None
        enemy = enemy or _faction(p.get("currentOwner")) or _faction(c.get("faction"))
        if not enemy:
            continue
        names = [h.get("name", "") for h in p.get("hazards") or [] if _norm(h.get("name")) not in ("", "none")]
        ids = []
        for n in names:
            k = _norm(n)
            hid = hz.get(k) or hz.get(k.rstrip("s"))
            if hid and hid not in ids:
                ids.append(hid)
        mx, hp = p.get("maxHealth") or 0, p.get("health") or 0
        if ev:
            emx, ehp = ev.get("maxHealth") or 0, ev.get("health") or 0
            pct = round(100 * (1 - ehp / emx)) if emx else None
        else:
            pct = round(100 * (1 - hp / mx)) if mx else None
        regions = p.get("regions") or []
        out.append({
            "index": p.get("index"),
            "name": (p.get("name") or "").title(),
            "sector": p.get("sector") or "",
            "biome": (p.get("biome") or {}).get("name") or "",
            "enemy": enemy,
            "defense": bool(ev),
            "hazards": ids,
            "hazard_names": names,
            "players": (p.get("statistics") or {}).get("playerCount") or 0,
            "progress": pct,
            "city": any((r.get("size") or "") in ("City", "MegaCity") for r in regions),
            "mo": p.get("index") in mo_planets,
        })
    out.sort(key=lambda x: (not x["mo"], -x["players"]))
    return out


def _orders(assignments: list) -> tuple[list, set]:
    orders, planets = [], set()
    for a in assignments or []:
        tasks, prog = a.get("tasks") or [], a.get("progress") or []
        rows = []
        for i, tk in enumerate(tasks):
            vals, types = tk.get("values") or [], tk.get("valueTypes") or []
            got = prog[i] if i < len(prog) else 0
            goal = None
            for v, ty in zip(vals, types):
                if ty == 3:          # valueType 3: the task's target count
                    goal = v
                if ty == 12 and v:   # valueType 12: a planet index
                    planets.add(v)
            if goal and goal > 1:
                rows.append({"got": got, "goal": goal, "pct": min(100, round(100 * got / goal))})
            else:
                rows.append({"done": bool(got)})
        rw = a.get("reward") or {}
        orders.append({"id": a.get("id"), "title": (a.get("title") or "Major Order").strip(),
                       "briefing": (a.get("briefing") or a.get("description") or "").strip()[:600],
                       "expires": a.get("expiration"), "tasks": rows,
                       "reward": rw.get("amount") if rw.get("type") == 1 else None})
    return orders, planets


def _refresh() -> dict:
    assignments = _get("assignments")
    orders, mo_planets = _orders(assignments if isinstance(assignments, list) else [])
    campaigns = _get("campaigns")
    return {"orders": orders, "planets": _planets(campaigns if isinstance(campaigns, list) else [], mo_planets)}


def snapshot() -> dict:
    """The current war, cached. Never raises; {"ok": False} when there's nothing to show."""
    now = time.time()
    with _lock:
        if _cache["data"] is not None and now - _cache["ok_at"] < CACHE_S:
            return {"ok": True, "stale": False, "fetched": _cache["ok_at"], **_cache["data"]}
        if _cache["error"] and now - _cache["at"] < 60:  # last attempt failed: don't hammer the API
            return _fallback(now)
        try:
            _cache["data"] = _refresh()
            _cache["at"] = _cache["ok_at"] = now
            _cache["error"] = None
            return {"ok": True, "stale": False, "fetched": now, **_cache["data"]}
        except Exception as e:  # network, HTTP 429/5xx, schema drift: degrade, don't break the app
            _cache["at"], _cache["error"] = now, f"{type(e).__name__}: {e}"[:200]
            return _fallback(now)


def _fallback(now: float) -> dict:
    if _cache["data"] is not None and now - _cache["ok_at"] < STALE_S:
        return {"ok": True, "stale": True, "fetched": _cache["ok_at"], **_cache["data"]}
    return {"ok": False, "error": _cache["error"], "orders": [], "planets": []}


def status() -> dict:
    return {"cached": _cache["data"] is not None, "age_s": round(time.time() - _cache["ok_at"]) if _cache["ok_at"] else None,
            "error": _cache["error"]}


if __name__ == "__main__":
    print(json.dumps(snapshot(), indent=1)[:12000])
