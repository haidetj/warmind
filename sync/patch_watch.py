#!/usr/bin/env python3
"""Watch the Helldivers 2 update feed and flag when a new patch ships.

There is no authoritative API for HD2's mission / hazard / item catalog, so the
honest way to keep the seed fresh is to notice the day the game patches and drive
an editorial update. This polls the Steam news feed (open internet — runs on a
GitHub Actions runner, not the app) and, for EVERY patch newer than the last seen
one, writes its notes to sync/patches/<date>-<gid>.md (never overwritten), queues
its gid in state.json["pending"], refreshes sync/latest_patch.md, and signals
drift so the workflow opens an issue and the Claude scheduled task drafts the data
update on a data-sync/* branch (data-sync-pr.yml then opens the draft PR).

    python3 sync/patch_watch.py        # exit 0 = no new patch, 10 = new patch, 2 = fetch error

Emits `drift=true|false` and `title=...` to $GITHUB_OUTPUT when present.
"""

from __future__ import annotations

import datetime
import html
import json
import os
import pathlib
import re
import urllib.request

APPID = 553850  # Helldivers 2
NEWS_URL = (f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
            f"?appid={APPID}&count=15&maxlength=0")
PATCH_RE = re.compile(r"patch|hotfix|update|balance|warbond|major order", re.I)

SYNC = pathlib.Path(__file__).resolve().parent
STATE = SYNC / "state.json"
NOTES = SYNC / "latest_patch.md"     # newest patch, for humans skimming the repo
PATCHES = SYNC / "patches"           # one file per patch, never overwritten


def load_state() -> dict:
    state = {"last_seen_gid": None, "last_seen_title": None, "last_seen_date": 0,
             "processed_gid": None, "pending": []}
    if STATE.exists():
        state.update(json.loads(STATE.read_text()))
    state.setdefault("pending", [])
    return state


def render(item: dict) -> str:
    return (f"# {item.get('title', 'Helldivers 2 update')}\n\n"
            f"- Steam post: {item.get('url', '')}\n"
            f"- gid: `{item.get('gid')}`\n\n"
            f"---\n\n{strip(item.get('contents', ''))}\n")


def fetch_items() -> list[dict]:
    req = urllib.request.Request(NEWS_URL, headers={"User-Agent": "warmind-patch-watch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return data.get("appnews", {}).get("newsitems", [])


def strip(text: str) -> str:
    text = re.sub(r"\[/?[^\]]+\]", "", text)          # Steam BBCode
    text = re.sub(r"<[^>]+>", "", text)               # stray HTML
    return html.unescape(text).strip()


def emit(**kw):
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        return
    with open(out, "a") as fh:
        for k, v in kw.items():
            fh.write(f"{k}={v}\n")


def main():
    state = load_state()
    try:
        items = fetch_items()
    except Exception as e:
        print(f"fetch error (transient — not failing): {e}")
        emit(drift="false")
        raise SystemExit(2)

    patches = sorted((it for it in items if PATCH_RE.search(it.get("title", ""))),
                     key=lambda it: it.get("date", 0))
    if not patches:
        print("no patch-like posts in the latest feed.")
        emit(drift="false")
        return

    # Every patch newer than the last one we saw — not just the newest — so two
    # patches between runs both get recorded. On a fresh state, start from the newest.
    since = state.get("last_seen_date") or 0
    known = set(state["pending"]) | {state.get("last_seen_gid"), state.get("processed_gid")}
    new = [it for it in patches if it.get("date", 0) > since and str(it.get("gid")) not in known]
    if since == 0:
        new = new[-1:]
    if not new:
        print(f"no new patch (latest still: {patches[-1].get('title')!r}).")
        emit(drift="false")
        return

    PATCHES.mkdir(exist_ok=True)
    for it in new:
        gid = str(it.get("gid"))
        day = datetime.datetime.fromtimestamp(it.get("date", 0), datetime.timezone.utc).strftime("%Y-%m-%d")
        (PATCHES / f"{day}-{gid}.md").write_text(render(it))
        state["pending"].append(gid)
        print(f"NEW PATCH DETECTED: {it.get('title')!r} (gid {gid})")
    latest = new[-1]
    NOTES.write_text(render(latest))
    state.update({"last_seen_gid": str(latest.get("gid")), "last_seen_title": latest.get("title"),
                  "last_seen_date": latest.get("date", 0)})
    STATE.write_text(json.dumps(state, indent=2) + "\n")
    title = latest.get("title", "Helldivers 2 update")
    if len(new) > 1:
        title = f"{len(new)} patches — latest: {title}"
    emit(drift="true", title=title, gid=str(latest.get("gid")))
    raise SystemExit(10)


if __name__ == "__main__":
    main()
