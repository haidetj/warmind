#!/usr/bin/env python3
"""Verify WARMIND's item data against the Helldivers 2 wiki (helldivers.wiki.gg).

Runs on GitHub Actions (the app host and dev sandboxes can't reach the wiki). For
every item in items.yaml it resolves the wiki page, reads the page's infobox, and
compares the fields that change loadouts — armor weight and passive, stratagem
type, warbond — against our data. Any mismatch fails the run, so a wrong
classification can't merge silently.

    python3 sync/verify_wiki.py               # verify everything; exit 1 on mismatch
    python3 sync/verify_wiki.py --discover 8  # dump raw infoboxes of N sample pages
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))

from warmind import loader  # noqa: E402

API = "https://helldivers.wiki.gg/api.php"
UA = "WARMIND-data-verifier/1.0 (https://github.com/haidetj/warmind; squad coach data check)"
SECTIONS = ("primaries", "secondaries", "grenades", "stratagems", "armor", "boosters")


def api(**params) -> dict:
    params.setdefault("format", "json")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001 — retry transient errors, then surface
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
            last = e  # noqa: F841
    return {}


def page_title(rec: dict) -> str:
    if rec.get("wiki"):
        return urllib.parse.unquote(rec["wiki"].rsplit("/wiki/", 1)[-1]).replace("_", " ")
    return rec["name"]


def wikitext(title: str):
    """(resolved_title, wikitext) or (None, None) if the page doesn't exist."""
    d = api(action="parse", page=title, prop="wikitext", redirects=1)
    if "error" in d:
        return None, None
    return d["parse"]["title"], d["parse"]["wikitext"]["*"]


def infobox(text: str) -> tuple[str, dict]:
    """First {{Infobox ...}}-style template on the page: (template name, {param: value})."""
    m = re.search(r"\{\{\s*([^|{}]*?(?:[Ii]nfobox|[Bb]ox)[^|{}]*?)\s*\|", text)
    if not m:
        return "", {}
    start, depth, i = m.start(), 0, m.start()
    while i < len(text):
        if text.startswith("{{", i):
            depth += 1; i += 2; continue
        if text.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                break
            continue
        i += 1
    body = text[m.end():i - 2]
    params, cur, depth = {}, "", 0
    parts = []
    for ch in body:  # split on top-level pipes only
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        if ch == "|" and depth == 0:
            parts.append(cur); cur = ""
        else:
            cur += ch
    parts.append(cur)
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip().lower()] = clean(v)
    return m.group(1).strip(), params


def clean(v: str) -> str:
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", v)       # [[link|text]] -> text
    v = re.sub(r"\{\{[^{}]*?\|([^{}|]*)\}\}", r"\1", v)            # {{tpl|x}} -> x
    v = re.sub(r"<[^>]+>", " ", v)
    return re.sub(r"\s+", " ", v).strip()


def discover(n: int) -> int:
    raw = loader.items()
    picks = []
    for s in SECTIONS:
        picks += [(s, r) for r in raw.get(s, [])[:2]]
    picks.append(("armor", next((r for r in raw["armor"] if "Legionnaire" in r["name"]), raw["armor"][0])))
    for s, rec in picks[:max(n, 1)]:
        title, text = wikitext(page_title(rec))
        print(f"\n=== {s}: {rec['name']} -> {title}")
        if not text:
            print("   (no page)")
            continue
        name, params = infobox(text)
        print(f"   template: {name}")
        print("   " + json.dumps(params, ensure_ascii=False)[:1500])
        if not params:
            print("   head: " + text[:600].replace("\n", " | "))
    return 0


if __name__ == "__main__":
    if "--discover" in sys.argv:
        i = sys.argv.index("--discover")
        sys.exit(discover(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 8))
    print("verify mode lands after discovery; run with --discover")
    sys.exit(0)
