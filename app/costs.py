"""What WARMIND spends on Claude, two ways.

1. Every call the app makes records its own `usage` (input, cache write, cache read,
   output tokens) and prices it at list rates: exact per call, attributable per kind
   (career read, debrief read, review, mission prefill, squad screenshot, planner).
2. With an Admin API key (ANTHROPIC_ADMIN_KEY, sk-ant-admin...), a background poller
   reads Anthropic's own cost report (GET /v1/organizations/cost_report, daily, USD) and
   keeps the last 31 days: the real bill. It covers the whole Anthropic organization, so
   another project on the same org shows up there too.

List prices (USD per million tokens) come from Anthropic's docs; WARMIND_PRICES (JSON,
{"model": {"in":..,"out":..,"cache_read":..}}) overrides them if they change.
Hosting has no billing API on Render: WARMIND_HOSTING_USD_MONTH states it by hand.
"""

from __future__ import annotations

import json
import os
import threading
import time

import httpx

import db

# list prices, USD per million tokens (platform.claude.com pricing); cache writes are 1.25x input (5-minute cache)
PRICES = {
    "claude-sonnet-5": {"in": 2.0, "out": 10.0, "cache_read": 0.20},
    "claude-sonnet-5-5": {"in": 2.0, "out": 10.0, "cache_read": 0.20},
    "claude-haiku-5-5": {"in": 0.10, "out": 0.50, "cache_read": 0.01},
    "claude-opus-5-5": {"in": 4.0, "out": 20.0, "cache_read": 0.20},
}
try:
    PRICES.update(json.loads(os.environ.get("WARMIND_PRICES") or "{}"))
except Exception:
    pass
CACHE_WRITE_X = 1.25

def _find_admin_key() -> tuple[str, str]:
    """(env var name, key): ANTHROPIC_ADMIN_KEY first, else any variable holding an Admin API key."""
    for name in ("ANTHROPIC_ADMIN_KEY", "ANTHROPIC_ADMIN_API_KEY", "ADMIN_API_KEY", "WARMIND_ADMIN_KEY"):
        if os.environ.get(name):
            return name, os.environ[name].strip()
    for name, val in os.environ.items():
        if (val or "").strip().startswith("sk-ant-admin"):
            return name, val.strip()
    return "", ""


ADMIN_VAR, ADMIN_KEY = _find_admin_key()
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
POLL_S = int(os.environ.get("WARMIND_COST_POLL_S", "1800"))   # every 30 minutes (the API asks for at most once a minute)
HOSTING = os.environ.get("WARMIND_HOSTING_USD_MONTH", "")

ADMIN = {"enabled": bool(ADMIN_KEY), "status": "off" if not ADMIN_KEY else "waiting", "at": None, "error": None,
         "var": ADMIN_VAR or None,   # which env variable held it (never the value)
         "looks_admin": ADMIN_KEY.startswith("sk-ant-admin") if ADMIN_KEY else None}
_started = False


def _rate(model: str) -> dict | None:
    if model in PRICES:
        return PRICES[model]
    base = next((k for k in PRICES if model.startswith(k)), None)   # dated snapshots, e.g. claude-sonnet-5-20261001
    return PRICES.get(base) if base else None


def price(model: str, usage: dict) -> float | None:
    r = _rate(model)
    if not r:
        return None
    u = usage or {}
    cw = int(u.get("cache_creation_input_tokens") or 0)
    return round((int(u.get("input_tokens") or 0) * r["in"] + cw * r["in"] * CACHE_WRITE_X
                  + int(u.get("cache_read_input_tokens") or 0) * r.get("cache_read", r["in"] * 0.1)
                  + int(u.get("output_tokens") or 0) * r["out"]) / 1e6, 6)


def record(kind: str, model: str, usage: dict | None, lobby_id: str | None = None) -> None:
    """Called after every Claude response (billed even when the caller then fails)."""
    try:
        u = usage or {}
        db.add_usage(kind, model, lobby_id, int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0),
                     int(u.get("cache_read_input_tokens") or 0), int(u.get("cache_creation_input_tokens") or 0),
                     price(model, u))
    except Exception:
        pass   # accounting never breaks a briefing


# ---------------------------------------------------------------- Anthropic's own cost report
def _poll_once() -> None:
    now = time.time()
    start = time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime(now - 30 * 86400))
    headers = {"x-api-key": ADMIN_KEY, "anthropic-version": "2023-06-01"}
    days, page = {}, None
    with httpx.Client(timeout=30) as c:
        for _ in range(5):   # pages
            params = [("starting_at", start), ("bucket_width", "1d"), ("limit", "31"), ("group_by[]", "description")]
            if page:
                params.append(("page", page))
            r = c.get(f"{BASE_URL}/v1/organizations/cost_report", headers=headers, params=params)
            if r.status_code >= 400:
                raise RuntimeError(f"cost report {r.status_code}: {r.text[:200]}")
            body = r.json()
            for b in body.get("data") or []:
                day = (b.get("starting_at") or "")[:10]
                for res in b.get("results") or []:
                    cents = float(res.get("amount") or 0)   # decimal string, in cents
                    d = days.setdefault(day, {"usd": 0.0, "by": {}})
                    d["usd"] += cents / 100
                    key = res.get("model") or res.get("description") or res.get("cost_type") or "other"
                    d["by"][key] = d["by"].get(key, 0.0) + cents / 100
            if not body.get("has_more"):
                break
            page = body.get("next_page")
    db.put_cost_report(json.dumps({"days": days, "at": now}))


def _loop():
    while True:
        try:
            _poll_once()
            ADMIN.update(status="ok", at=round(time.time()), error=None)
        except Exception as e:
            ADMIN.update(status="failed", at=round(time.time()), error=f"{type(e).__name__}: {e}"[:300])
        time.sleep(max(60, POLL_S))


def start() -> None:
    global _started
    if ADMIN_KEY and not _started:
        _started = True
        threading.Thread(target=_loop, daemon=True).start()


def poll_now() -> dict:
    if not ADMIN_KEY:
        return dict(ADMIN)
    try:
        _poll_once()
        ADMIN.update(status="ok", at=round(time.time()), error=None)
    except Exception as e:
        ADMIN.update(status="failed", at=round(time.time()), error=f"{type(e).__name__}: {e}"[:300])
    return dict(ADMIN)


# ---------------------------------------------------------------- the report
def report() -> dict:
    now = time.time()
    rows = db.usage_since(now - 31 * 86400)
    day = lambda ts: time.strftime("%Y-%m-%d", time.gmtime(ts))
    today, month = day(now), time.strftime("%Y-%m", time.gmtime(now))
    tot = {"today": 0.0, "7d": 0.0, "30d": 0.0, "mtd": 0.0}
    by_kind, daily, models = {}, {}, set()
    unpriced = 0
    for r in rows:
        c = r["cost_usd"]
        if c is None:
            unpriced += 1
            c = 0.0
        age = now - r["at"]
        if day(r["at"]) == today:
            tot["today"] += c
        if age <= 7 * 86400:
            tot["7d"] += c
        if age <= 30 * 86400:
            tot["30d"] += c
            k = by_kind.setdefault(r["kind"], {"calls": 0, "usd": 0.0, "in": 0, "out": 0, "cache_read": 0})
            k["calls"] += 1; k["usd"] += c; k["in"] += r["input_tokens"] + r["cache_write"]; k["out"] += r["output_tokens"]
            k["cache_read"] += r["cache_read"]
        if day(r["at"]).startswith(month):
            tot["mtd"] += c
        daily[day(r["at"])] = daily.get(day(r["at"]), 0.0) + c
        models.add(r["model"])
    for k in by_kind.values():
        k["avg"] = round(k["usd"] / k["calls"], 4) if k["calls"] else 0.0
        k["usd"] = round(k["usd"], 4)
    days30 = [day(now - i * 86400) for i in range(29, -1, -1)]
    # Anthropic's bill
    bill = None
    raw = db.get_cost_report()
    if raw:
        rep = json.loads(raw)
        dd = rep.get("days") or {}
        bill = {"at": rep.get("at"), "today": round(dd.get(today, {}).get("usd", 0.0), 4),
                "mtd": round(sum(v["usd"] for k, v in dd.items() if k.startswith(month)), 4),
                "30d": round(sum(v["usd"] for v in dd.values()), 4),
                "daily": [round(dd.get(d, {}).get("usd", 0.0), 4) for d in days30],
                "by": {}}
        for v in dd.values():
            for k, x in v["by"].items():
                bill["by"][k] = round(bill["by"].get(k, 0.0) + x, 4)
    # the month so far, projected over a 30-day month
    dom = int(time.strftime("%d", time.gmtime(now)))
    host = float(HOSTING) if HOSTING.replace(".", "", 1).isdigit() else None
    basis = bill["mtd"] if bill else tot["mtd"]
    return {
        "app": {k: round(v, 4) for k, v in tot.items()}, "by_kind": by_kind, "models": sorted(models),
        "daily": [round(daily.get(d, 0.0), 4) for d in days30], "days": days30, "unpriced_calls": unpriced,
        "bill": bill, "admin": dict(ADMIN), "hosting_month": host,
        "projected_month": round(basis / max(1, dom) * 30 + (host or 0.0), 2),
        "prices": {m: _rate(m) for m in sorted(models) if _rate(m)},
    }
