"""WARMIND on Discord: a user-installable app, no server admin needed.

Each diver adds the app to their own Discord account once (the install link on their Profile).
From then on `/warmind table`, `/warmind room`, `/warmind diver` and `/warmind front` work in any
server, channel or DM where members may use external apps (Discord's default), and post a live
picture card with "Open in WARMIND" and "Refresh" buttons. Plain WARMIND links unfurl into the
same cards without the app (Open Graph tags on `/`).

Setup (once, by whoever owns the Discord application):
  DISCORD_APP_ID, DISCORD_PUBLIC_KEY   -> verify interactions (required)
  DISCORD_BOT_TOKEN                    -> lets the server register the commands at startup
and the application's Interactions Endpoint URL set to <site>/api/discord/interactions.
"""

from __future__ import annotations

import json
import os
import threading
import time

import httpx

APP_ID = os.environ.get("DISCORD_APP_ID", "").strip()
PUBLIC_KEY = os.environ.get("DISCORD_PUBLIC_KEY", "").strip()
BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
API = "https://discord.com/api/v10"
GREEN, AMBER = 0x78FFAA, 0xFF9A3C
STATUS = {"registered": None, "error": None, "at": None}

# one /warmind command; usable in servers, the bot's DM and group DMs, installed to a user or a server
COMMANDS = [{
    "name": "warmind", "description": "WARMIND: war tables, war rooms, divers and the front",
    "integration_types": [0, 1], "contexts": [0, 1, 2],
    "options": [
        {"type": 1, "name": "table", "description": "Post a war table's live card (squad, Go / No-Go, debriefs)",
         "options": [{"type": 3, "name": "table", "description": "Pick a recent table or paste its code / link",
                      "required": True, "autocomplete": True}]},
        {"type": 1, "name": "room", "description": "Post a war room's card (stats, tonight's mission, orders)",
         "options": [{"type": 3, "name": "room", "description": "Pick a room or paste its code / link",
                      "required": True, "autocomplete": True}]},
        {"type": 1, "name": "diver", "description": "Post a diver's profile card",
         "options": [{"type": 3, "name": "callsign", "description": "The diver's callsign",
                      "required": True, "autocomplete": True}]},
        {"type": 1, "name": "front", "description": "The Major Order and the busiest planets right now"},
    ],
}]


def enabled() -> bool:
    return bool(APP_ID and PUBLIC_KEY)


def install_url() -> str | None:
    if not APP_ID:
        return None
    return f"https://discord.com/oauth2/authorize?client_id={APP_ID}&integration_type=1&scope=applications.commands"


def verify(signature: str, timestamp: str, body: bytes) -> bool:
    """Discord signs every interaction with the application's Ed25519 key."""
    if not (PUBLIC_KEY and signature and timestamp):
        return False
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY)).verify(bytes.fromhex(signature), timestamp.encode() + body)
        return True
    except Exception:
        return False


def register() -> None:
    """Overwrite the app's global commands (idempotent). Runs in the background at startup."""
    if not (APP_ID and BOT_TOKEN):
        return
    try:
        r = httpx.put(f"{API}/applications/{APP_ID}/commands", json=COMMANDS,
                      headers={"Authorization": f"Bot {BOT_TOKEN}"}, timeout=20)
        if r.status_code >= 300:
            STATUS["error"] = f"HTTP {r.status_code}: {r.text[:200]}"
        else:
            STATUS["registered"], STATUS["error"] = [c["name"] for c in r.json()], None
    except Exception as e:
        STATUS["error"] = f"{type(e).__name__}: {e}"[:200]
    STATUS["at"] = time.time()


def start() -> None:
    if APP_ID and BOT_TOKEN:
        threading.Thread(target=register, daemon=True).start()


def status() -> dict:
    return {"enabled": enabled(), "commands": bool(BOT_TOKEN), **STATUS}


# ---------------------------------------------------------------- responses
def _id_from(text: str, key: str) -> str:
    """A code, or the code out of a pasted link (?l=xxxx / ?room=xxxx)."""
    text = (text or "").strip()
    if "=" in text:
        import urllib.parse
        q = urllib.parse.parse_qs(urllib.parse.urlparse(text).query)
        if q.get(key):
            return q[key][0][:40]
    return text[:40]


def _message(title, url, desc, img, color, refresh_id=None):
    embed = {"title": title[:256], "url": url, "description": desc[:2000], "color": color,
             "footer": {"text": "WARMIND"}}
    if img:
        embed["image"] = {"url": img}
    buttons = [{"type": 2, "style": 5, "label": "Open in WARMIND", "url": url}]
    if refresh_id:
        buttons.append({"type": 2, "style": 2, "label": "Refresh", "custom_id": refresh_id})
    return {"embeds": [embed], "components": [{"type": 1, "components": buttons}], "allowed_mentions": {"parse": []}}


def _ephemeral(text):
    return {"type": 4, "data": {"content": text[:2000], "flags": 64}}


def handle(payload: dict, cards_api) -> dict:
    """One interaction -> its response. `cards_api` is the server's card helper
    (card(kind, id) -> (title, url, desc, image url) or None; pickers; front())."""
    kind = payload.get("type")
    if kind == 1:   # PING
        return {"type": 1}
    data = payload.get("data") or {}
    if kind == 4:   # autocomplete
        sub = (data.get("options") or [{}])[0]
        opt = next((o for o in sub.get("options") or [] if o.get("focused")), {})
        choices = cards_api.pick(sub.get("name"), str(opt.get("value") or ""))
        return {"type": 8, "data": {"choices": choices[:25]}}
    if kind == 3:   # a button: Refresh
        cid = str(data.get("custom_id") or "")
        if cid.startswith("refresh:"):
            _, ck, ident = (cid.split(":", 2) + ["", ""])[:3]
            got = cards_api.card(ck, ident, fresh=True)
            if not got:
                return _ephemeral("That card is gone.")
            return {"type": 7, "data": _message(*got, GREEN if ck != "table" else AMBER, refresh_id=cid)}
        return _ephemeral("Unknown button.")
    if kind == 2:   # /warmind <sub>
        sub = (data.get("options") or [{}])[0]
        name = sub.get("name")
        vals = {o["name"]: o.get("value") for o in sub.get("options") or []}
        if name == "front":
            title, url, desc = cards_api.front()
            return {"type": 4, "data": _message(title, url, desc, None, AMBER)}
        if name == "table":
            ident = _id_from(str(vals.get("table") or ""), "l")
        elif name == "room":
            ident = _id_from(str(vals.get("room") or ""), "room")
        elif name == "diver":
            ident = cards_api.diver_id(str(vals.get("callsign") or ""))
        else:
            return _ephemeral("Unknown command.")
        ck = {"table": "table", "room": "room", "diver": "diver"}[name]
        got = cards_api.card(ck, ident) if ident else None
        if not got:
            return _ephemeral(f"No {name} found for “{json.dumps(next(iter(vals.values()), ''))[1:-1]}”.")
        return {"type": 4, "data": _message(*got, GREEN if ck != "table" else AMBER, refresh_id=f"refresh:{ck}:{ident}")}
    return _ephemeral("Unsupported interaction.")
