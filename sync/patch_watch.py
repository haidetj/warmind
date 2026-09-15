#!/usr/bin/env python3
"""Watch the Helldivers 2 update feed and flag when a new patch ships.

There is no authoritative API for HD2's mission / hazard / item catalog, so the
honest way to keep the seed fresh is to notice the day the game patches and drive
an editorial update. This polls the Steam news feed (open internet — runs on a
GitHub Actions runner, not the app) and, when a patch newer than the last seen
one appears, writes the notes to sync/latest_patch.md, advances sync/state.json,
and signals drift so the workflow can open an issue + let Claude draft a PR.

    python3 sync/patch_watch.py        # exit 0 = no new patch, 10 = new patch, 2 = fetch error

Emits `drift=true|false` and `title=...` to $GITHUB_OUTPUT when present.
"""

from __future__ import annotations

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
NOTES = SYNC / "latest_patch.md"


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"last_seen_gid": None, "last_seen_title": None, "last_seen_date": 0, "processed_gid": None}


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

    patches = [it for it in items if PATCH_RE.search(it.get("title", ""))]
    latest = max(patches, key=lambda it: it.get("date", 0)) if patches else None
    if not latest:
        print("no patch-like posts in the latest feed.")
        emit(drift="false")
        return

    gid = str(latest.get("gid"))
    if gid == state.get("last_seen_gid"):
        print(f"no new patch (latest still: {latest.get('title')!r}).")
        emit(drift="false")
        return

    # new patch
    title = latest.get("title", "Helldivers 2 update")
    NOTES.write_text(
        f"# {title}\n\n"
        f"- Steam post: {latest.get('url','')}\n"
        f"- gid: `{gid}`\n\n"
        f"---\n\n{strip(latest.get('contents',''))}\n"
    )
    state.update({"last_seen_gid": gid, "last_seen_title": title,
                  "last_seen_date": latest.get("date", 0)})
    STATE.write_text(json.dumps(state, indent=2) + "\n")
    print(f"NEW PATCH DETECTED: {title!r} (gid {gid})")
    emit(drift="true", title=title, gid=gid)
    raise SystemExit(10)


if __name__ == "__main__":
    main()
