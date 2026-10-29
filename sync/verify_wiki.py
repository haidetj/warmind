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
import os
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


# ---------------------------------------------------------------- catalog
# Item pages are found by the infobox template they use. The stratagem templates
# beyond Support Weapon are probed; any that don't exist simply return nothing.
TEMPLATES = ["Infobox Weapon", "Infobox Throwable", "Infobox Armor", "Infobox Booster",
             "Infobox Support Weapon", "Infobox Stratagem", "Infobox Backpack", "Infobox Eagle",
             "Infobox Orbital", "Infobox Sentry", "Infobox Emplacement", "Infobox Mine",
             "Infobox Vehicle", "Infobox Exosuit", "Infobox Defensive"]
KEEP = ("type", "passive", "source", "weapon_category", "weapon_type", "weapon_traits", "throwable_traits",
        "stratagem_type", "traits", "base_cooldown", "penetration", "permit_type", "description", "armor", "speed",
        "stratagem_image", "image", "weapon_image",
        # weapon handling stats (Infobox Weapon / Support Weapon / Throwable)
        "damage", "capacity", "recoil", "reload_time", "fire_rate", "dps", "spare_mags", "firing_modes",
        "fuse_time", "blast_radius", "outer_radius", "inner_radius")


def embedded_in(template: str) -> list[str]:
    out, cont = [], {}
    while True:
        d = api(action="query", list="embeddedin", eititle="Template:" + template, einamespace=0,
                eilimit=500, **cont)
        out += [x["title"] for x in d.get("query", {}).get("embeddedin", [])]
        if "continue" not in d:
            return out
        cont = {"eicontinue": d["continue"]["eicontinue"]}


def texts(titles: list[str]) -> dict:
    out = {}
    for i in range(0, len(titles), 40):
        d = api(action="query", prop="revisions", rvprop="content", rvslots="main", redirects=1,
                titles="|".join(titles[i:i + 40]))
        for pg in d.get("query", {}).get("pages", {}).values():
            rev = (pg.get("revisions") or [{}])[0]
            out[pg["title"]] = rev.get("slots", {}).get("main", {}).get("*", "")
        time.sleep(0.5)
    return out


def catalog() -> dict:
    seen, rows = set(), []
    for tpl in TEMPLATES:
        titles = [t for t in embedded_in(tpl) if t not in seen and "/" not in t.split(" ")[0][:0]]
        print(f"{tpl}: {len(titles)} pages")
        for title, text in texts(titles).items():
            if title in seen:
                continue
            name, params = infobox(text)
            if not params:
                continue
            seen.add(title)
            rows.append({"title": title, "template": name.replace("_", " "),
                         **{k: params[k] for k in KEEP if params.get(k)}})
    rows.sort(key=lambda r: (r["template"], r["title"]))
    return {"source": "https://helldivers.wiki.gg", "fetched": time.strftime("%Y-%m-%d"), "items": rows}


# ---------------------------------------------------------------- verify
# Where an item comes from, normalized. Ship modules and the starter kit are
# requisition / always-owned; everything else is a named unlock source.
BASE_SOURCES = {"", "helldivers mobilize", "starter equipment", "standard", "patriotic administration center",
                "engineering bay", "hangar", "hanger", "robotics workshop", "bridge", "orbital cannons", "n/a", "none"}
SECTION_OF = {"Infobox Weapon": None, "Infobox Throwable": "grenades", "Infobox Armor": "armor",
              "Infobox Booster": "boosters", "Infobox Support Weapon": "stratagems", "Infobox Stratagem": "stratagems"}
CATEGORY_OF = {"Support Weapon": {"support"}, "Backpack": {"backpack"}, "Eagle": {"eagle"}, "Orbital": {"orbital"},
               "Sentry": {"sentry"}, "Emplacement": {"emplacement", "mine", "relay"}, "Vehicle": {"vehicle"}}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("’", "'").replace("!", "").strip()).casefold()


def source_of(row: dict) -> str:
    return norm(re.sub(r"\s*Page\s*\d+.*$", "", row.get("source") or ""))


def traits(row: dict) -> set:
    return {norm(t) for t in (row.get("traits") or "").split("{{*}}") if t.strip()}


def wiki_section(row: dict):
    if row["template"] == "Infobox Weapon":
        cat = norm(row.get("weapon_category"))
        return ("primaries" if cat.startswith("primary") else "secondaries" if cat.startswith("secondary")
                else "stratagems" if cat.startswith("support") else None)   # newer support-weapon pages
    return SECTION_OF.get(row["template"])


def verify(cat: dict) -> int:
    by_title = {norm(r["title"]): r for r in cat["items"]}
    raw = loader.items()
    problems, checked, ours = [], 0, set()
    for sec in SECTIONS:
        for rec in raw.get(sec, []):
            name = rec["name"]
            row = by_title.get(norm(page_title(rec)))
            ours.add(norm(page_title(rec)))
            if not row:
                problems.append((name, "page", "no wiki page with this exact name — fix the name or set `wiki:`"))
                continue
            checked += 1
            bad = lambda field, have, want: problems.append((name, field, f"ours {have!r} ≠ wiki {want!r}"))
            if wiki_section(row) and wiki_section(row) != sec:
                bad("section", sec, wiki_section(row))
            ours_src, wiki_src = norm(rec.get("warbond", "")), source_of(row)
            if (ours_src in BASE_SOURCES) != (wiki_src in BASE_SOURCES) or (
                    ours_src not in BASE_SOURCES and ours_src != wiki_src):
                bad("warbond", rec.get("warbond", "(base)"), row.get("source") or "(base)")
            if sec == "armor":
                if norm(rec.get("weight")) != norm(row.get("type")):
                    bad("weight", rec.get("weight"), row.get("type"))
                if norm(rec.get("passive")) != norm(row.get("passive")):
                    bad("passive", rec.get("passive"), row.get("passive"))
            if sec == "stratagems":
                st = row.get("stratagem_type", "")
                want = CATEGORY_OF.get(st)
                if want and rec.get("category") not in want:
                    bad("category", rec.get("category"), st)
                tr = traits(row)
                wiki_bp = "backpack" in tr or st == "Backpack"
                if bool(rec.get("backpack")) != wiki_bp:
                    bad("backpack", bool(rec.get("backpack")), wiki_bp)
                if bool(rec.get("expendable")) != ("expendable" in tr):
                    bad("expendable", bool(rec.get("expendable")), "expendable" in tr)
    missing = [r for r in cat["items"] if norm(r["title"]) not in ours and wiki_section(r)
               and r.get("stratagem_type") not in ("Objective", "Ship", "Other")]
    lines = [f"## Wiki verification: {checked} items checked, {len(problems)} mismatch(es)", ""]
    if problems:
        lines += ["| Item | Field | Problem |", "|---|---|---|"] + [f"| {n} | {f} | {m} |" for n, f, m in problems]
    lines += ["", f"Wiki items not in our data yet: {len(missing)}"]
    lines += [f"- {r['title']} ({wiki_section(r)}, {r.get('source') or 'base'})" for r in missing[:400]]
    report = "\n".join(lines)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(report + "\n")
    return 1 if problems else 0


def passives() -> dict:
    """What each armour passive does, from its wiki page (or its section of a list page)."""
    cat = json.loads((ROOT / "sync" / "wiki_catalog.json").read_text())
    names = sorted({r["passive"] for r in cat["items"] if r.get("passive")})
    out = {}
    for name in names:
        title, text = wikitext(name)
        if not text:
            title, text = wikitext(name + " (Armor Passive)")
        if not text:
            out[name] = {"page": None, "text": ""}
            continue
        sec = re.search(r"^=+\s*" + re.escape(name) + r"\s*=+\s*$(.*?)(?=^=+[^=]|\Z)", text, re.M | re.S)
        body = sec.group(1) if sec else text
        _, params = infobox(body)
        desc = params.get("description") or params.get("effect") or ""
        lead = re.sub(r"\{\{[^{}]*\}\}", "", body)
        lead = re.sub(r"\{\{[^{}]*\}\}", "", lead)
        lead = clean(re.sub(r"^\s*[|!{].*$", "", lead, flags=re.M))
        out[name] = {"page": title, "text": (desc + " " + lead).strip()[:900]}
        time.sleep(0.3)
    return out


# ---------------------------------------------------------------- armory (in-game menu layout + icons)
SUB = {"Support Weapon": "Support Weapons", "Backpack": "Backpacks", "Vehicle": "Vehicles", "Eagle": "Eagle",
       "Orbital": "Orbital", "Sentry": "Sentries", "Emplacement": "Emplacements"}
ICONS = ROOT / "app" / "static" / "icons"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


IMAGES = ROOT / "app" / "static" / "img"


def _trim_webp(data: bytes, box: int) -> bytes | None:
    """Crop a render's transparent margins, fit it in box x box, re-encode as WebP.
    Weapons sit small in the wiki's square thumbnails; trimmed they fill a tile."""
    try:
        from PIL import Image
    except ImportError:
        return None
    import io
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    bb = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bb:
        im = im.crop(bb)
    im.thumbnail((box, box), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=80, method=6)
    return buf.getvalue()


def _fetch_files(want: dict, dest_dir: pathlib.Path, url_prefix: str, width: int, trim: bool = False) -> dict:
    """want: {item name: wiki file name}. Resolves each file (a width-px thumbnail for
    raster files; SVGs come back as originals), downloads it, returns {item: url path}.
    trim: crop transparent margins and store as WebP (needs Pillow; PNG otherwise)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(set(want.values()))
    urls = {}
    for i in range(0, len(files), 40):
        d = api(action="query", prop="imageinfo", iiprop="url", iiurlwidth=width,
                titles="|".join("File:" + f for f in files[i:i + 40]))
        norm_map = {n["to"]: n["from"] for n in d.get("query", {}).get("normalized", [])}
        for pg in d.get("query", {}).get("pages", {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            src = norm_map.get(pg["title"], pg["title"]).split(":", 1)[-1]
            if ii.get("thumburl") or ii.get("url"):
                urls[src] = ii.get("thumburl") or ii.get("url")
        time.sleep(0.5)
    out = {}
    for name, f in want.items():
        u = urls.get(f) or urls.get(f.replace("_", " "))
        if not u:
            continue
        path = u.split("?")[0].lower()
        ext = ".svg" if path.endswith(".svg") else ".webp" if path.endswith(".webp") else ".jpg" if path.endswith((".jpg", ".jpeg")) else ".png"
        dest = dest_dir / (slug(name) + ext)
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            ok = (data[:4] == b"\x89PNG" or data[:3] == b"\xff\xd8\xff" or data[8:12] == b"WEBP"
                  or (ext == ".svg" and b"<svg" in data[:2000] and b"<script" not in data.lower()))
            if ok and trim and ext != ".svg":
                small = _trim_webp(data, width)
                if small:
                    data, dest = small, dest.with_suffix(".webp")
            if ok:
                dest.write_bytes(data)
                out[name] = url_prefix + dest.name
        except Exception as e:  # noqa: BLE001 — a missing picture just falls back to text
            print(f"file failed for {name}: {e}")
        time.sleep(0.15)
    return out


def _num(v) -> float | None:
    """'640 rpm' -> 640, '1,050' -> 1050, '3.5s' -> 3.5, '' -> None."""
    m = re.search(r"\d[\d,]*(?:\.\d+)?", str(v or ""))
    return float(m.group(0).replace(",", "")) if m else None


STAT_KEYS = {"damage": "damage", "capacity": "capacity", "recoil": "recoil", "reload_time": "reload",
             "fire_rate": "rpm", "dps": "dps", "spare_mags": "mags"}


def weapon_stats(row: dict) -> dict:
    """Numbers off the wiki infobox that say how a weapon handles (recoil, rate, magazine...)."""
    out = {k: _num(row.get(src)) for src, k in STAT_KEYS.items()}
    out = {k: (int(v) if v is not None and v == int(v) else v) for k, v in out.items() if v is not None}
    modes = [m.strip() for m in re.split(r"\{\{\*\}\}|,", row.get("firing_modes") or "") if m.strip()]
    if modes:
        out["modes"] = modes
    return out


def armory() -> dict:
    """For each of our items: its group in the in-game loadout menu, the stratagem permit
    colour + icon, and a picture (weapon/armour render, booster icon) from the wiki."""
    cat = json.loads((ROOT / "sync" / "wiki_catalog.json").read_text())
    by_title = {norm(r["title"]): r for r in cat["items"]}
    raw = loader.items()
    out, want_icons, want_imgs = {}, {}, {}
    for sec in SECTIONS:
        for rec in raw.get(sec, []):
            row = by_title.get(norm(page_title(rec))) or {}
            e = {}
            if sec in ("primaries", "secondaries", "grenades"):
                e["group"] = row.get("weapon_type") or "Other"
            elif sec == "armor":
                e["group"] = rec.get("weight", "Other")
            elif sec == "stratagems":
                e["permit"] = row.get("permit_type") or "Supply"
                e["group"] = SUB.get(row.get("stratagem_type", ""), "Other")
                # support-weapon pages call it stratagem_image; other stratagem pages call it image
                img = (row.get("stratagem_image") or (row.get("image") if row.get("template") == "Infobox Stratagem" else "") or "").strip()
                if img:
                    want_icons[rec["name"]] = img
            # the picture: weapon / throwable / armour renders, booster icons, support-weapon renders
            pic = row.get("weapon_image") if row.get("template") == "Infobox Support Weapon" else (
                row.get("image") if sec != "stratagems" else None)
            if pic:
                want_imgs[rec["name"]] = pic.replace("{{PAGENAME}}", row.get("title", rec["name"])).strip()
            st = weapon_stats(row)
            if st:
                e["stats"] = st
            out[rec["name"]] = e
    for name, path in _fetch_files(want_icons, ICONS, "/icons/", 64).items():
        out[name]["icon"] = path
    for name, path in _fetch_files(want_imgs, IMAGES, "/img/", 300, trim=True).items():
        out[name]["img"] = path
    keep = {v["img"].rsplit("/", 1)[-1] for v in out.values() if v.get("img")}
    for f in IMAGES.glob("*"):  # pictures of items we no longer have, or older formats
        if f.name not in keep:
            f.unlink()
    n_icons = sum(1 for v in out.values() if v.get("icon"))
    n_imgs = sum(1 for v in out.values() if v.get("img"))
    size = sum(f.stat().st_size for f in IMAGES.glob("*")) // 1024
    print(f"armory: {len(out)} items, {n_icons}/{len(want_icons)} stratagem icons, {n_imgs}/{len(want_imgs)} pictures ({size} KB)")
    return out


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


EFFECT_PAGES = ("Effects and Modifiers", "Effects", "Operation Modifiers", "Environmental Hazards", "Planetary Hazards")
EFFECT_CATEGORIES = ("Operation Modifiers", "Operation modifiers", "Effects", "Planetary Effects", "Environmental Hazards",
                     "Planetary Hazards", "Hazards")


def effects() -> dict:
    """Operation modifiers, planetary effects and environmental hazards, as the wiki
    describes them: the overview pages plus every page in the matching categories
    (each page's wikitext, trimmed). WARMIND's hazards.yaml / modifier list are checked
    against this so a modifier like Roving Shriekers can't be missing."""
    pages, members = {}, {}
    for t in EFFECT_PAGES:
        title, text = wikitext(t)
        if text:
            pages[title] = text[:20000]
        time.sleep(0.3)
    for cat in EFFECT_CATEGORIES:
        d = api(action="query", list="categorymembers", cmtitle="Category:" + cat, cmlimit=200, cmnamespace=0)
        names = [m["title"] for m in d.get("query", {}).get("categorymembers", [])]
        if names:
            members[cat] = names
        time.sleep(0.3)
    for cat, names in members.items():
        for n in names:
            if n in pages:
                continue
            title, text = wikitext(n)
            if text:
                pages[title] = text[:6000]
            time.sleep(0.2)
    return {"fetched": time.strftime("%Y-%m-%d"), "categories": members, "pages": pages}


if __name__ == "__main__":
    if "--effects" in sys.argv:
        out = ROOT / "sync" / "effects_wiki.json"
        data = effects()
        out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
        print(f"wrote {len(data['pages'])} effect pages; categories: { {k: len(v) for k, v in data['categories'].items()} }")
        sys.exit(0)
    if "--discover" in sys.argv:
        i = sys.argv.index("--discover")
        sys.exit(discover(int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 8))
    if "--armory" in sys.argv:
        out = ROOT / "app" / "warmind" / "data" / "armory.json"
        out.write_text(json.dumps(armory(), indent=1, ensure_ascii=False, sort_keys=True) + "\n")
        sys.exit(0)
    if "--passives" in sys.argv:
        out = ROOT / "sync" / "passives_wiki.json"
        data = passives()
        out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
        print(f"wrote {len(data)} passives; {sum(1 for v in data.values() if v['text'])} with text")
        sys.exit(0)
    if "--catalog" in sys.argv:
        out = ROOT / "sync" / "wiki_catalog.json"
        data = catalog()
        out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
        print(f"wrote {len(data['items'])} wiki items to {out}")
        sys.exit(0)
    path = ROOT / "sync" / "wiki_catalog.json"
    if "--offline" not in sys.argv:
        path.write_text(json.dumps(catalog(), indent=1, ensure_ascii=False) + "\n")
    sys.exit(verify(json.loads(path.read_text())))
