#!/usr/bin/env python3
"""Add every wiki item we don't have yet to items.yaml.

FACTS come from sync/wiki_catalog.json (built by verify_wiki.py from the wiki's
infoboxes): name, section, warbond source, armour weight + passive, stratagem type,
backpack, expendable. verify_wiki.py re-checks them on every data change.

EDITORIAL fields (coverage axes, kit tags, per-faction grade) are derived from the
wiki's traits by the rules below — deliberately conservative, grade B unless the
optional overrides file (researched tags/grades, keyed by item name) says otherwise.

    python3 sync/import_wiki_items.py [--overrides research.json]
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "sync"))

from warmind import loader  # noqa: E402
import verify_wiki as vw  # noqa: E402
from draft_update import _flow, item_line, append_items  # noqa: E402

FACTIONS = ("terminids", "automatons", "illuminate")
VOCAB = loader.kit_tag_vocabulary()


def _traits(row, key="traits"):
    return {vw.norm(t) for t in (row.get(key) or "").split("{{*}}") if t.strip()}


def _warbond(row) -> str | None:
    src = re.sub(r"\s*Page\s*\d+.*$", "", row.get("source") or "").replace("’", "'").replace("!", "").strip()
    return None if vw.norm(src) in vw.BASE_SOURCES else src


def _grade(tags) -> dict:
    g = {f: "B" for f in FACTIONS}
    if "fire_kit" in tags:
        g["automatons"] = "C"  # fire underperforms vs bots (research: anti_synergies)
    return g


def weapon(row, section):
    tr = _traits(row, "weapon_traits")
    wt = row.get("weapon_type", "")
    cov, tags = set(), set()
    if "heavy armor penetrating" in tr or "anti-tank" in tr:
        tags.add("heavy_pen"); cov.add("at")
    elif "medium armor penetrating" in tr:
        tags.add("light_pen")
    tags |= {"Assault Rifles": {"high_rof_ballistic", "ranged"}, "Marksman Rifles": {"marksman", "ranged"},
             "Sniper Rifles": {"marksman", "ranged"}, "Shotguns": {"close_quarters", "stagger_primary"},
             "Submachine Guns": {"close_quarters", "high_rof_ballistic"}, "Explosives": {"strong_primary"},
             "Energy-Based": {"energy"}, "Melee": {"melee", "close_quarters"}}.get(wt, set())
    if wt in ("Assault Rifles", "Shotguns", "Submachine Guns"):
        cov.add("ch")
    if "explosive" in tr:
        cov |= {"ch", "st"}; tags.add("strong_primary" if section == "primaries" else "explosive_secondary")
    if "incendiary" in tr:
        tags.add("fire_kit"); cov.add("ch")
    if tr & {"heat", "beam", "arc"}:
        tags.add("energy")
    if "beam" in tr or "heat" in tr:
        tags.add("ammo_independent")
    if "stun" in tr:
        cov.add("bc")
    return cov, tags


def throwable(row):
    tr = _traits(row, "throwable_traits")
    cov, tags = set(), set()
    if "explosive" in tr:
        cov |= {"ch", "st"}
    if tr & {"heavy armor penetrating", "anti-tank"}:
        cov.add("at"); tags.add("heavy_pen")
    if "incendiary" in tr:
        cov.add("ch"); tags.add("fire_kit")
    if tr & {"stun", "caustic"}:
        cov.add("bc")
    if "smoke" in vw.norm(row["title"]):
        cov.add("bc"); tags.add("stealth")
    return cov, tags


def stratagem(row):
    st, tr, title = row.get("stratagem_type", ""), _traits(row), row["title"]
    if st == "Support Weapon":
        cat = "support"
    elif st == "Emplacement":
        cat = "mine" if title.startswith("MD-") else "relay" if "Relay" in title else "emplacement"
    else:
        cat = {"Backpack": "backpack", "Eagle": "eagle", "Orbital": "orbital", "Sentry": "sentry",
               "Vehicle": "vehicle"}.get(st)
    if not cat:
        return None
    cov, tags = set(), set()
    if tr & {"anti-tank", "heavy armor penetrating", "heavy armour penetrating"}:
        cov.add("at"); tags.add("heavy_pen")
    if "explosive" in tr:
        cov |= {"st"} | ({"ch"} if cat in ("eagle", "orbital", "mine", "emplacement") else set())
    if tr & {"incendiary"}:
        cov.add("ch"); tags.add("fire_kit")
    if tr & {"caustic", "arc"}:
        cov.add("ch")
    if "medium armor penetrating" in tr and cat in ("support", "sentry", "emplacement"):
        cov.add("ch"); tags.add("light_pen")
    if tr & {"beam", "heat", "chargeup"} and cat == "support":
        tags.add("energy")
    tags |= {"support": {"support_weapon"}, "eagle": {"eagle"}, "orbital": {"orbital"},
             "sentry": {"sentry", "static_position"}, "emplacement": {"static_position"},
             "mine": {"static_position"}, "relay": {"shield_pack", "static_position"}}.get(cat, set())
    if cat == "backpack":
        if title.startswith("AX/"):
            tags.add("guard_dog"); cov.add("ch")
        elif title.startswith("LIFT-"):
            tags |= {"jump_pack", "mobility"}; cov.add("bc")
        elif title.startswith("SH-"):
            tags.add("shield_pack"); cov.add("bc")
        elif "Supply" in title:
            tags.add("backpack_sustain")
    backpack = "backpack" in tr or st == "Backpack"
    return cat, cov, tags, backpack, "expendable" in tr


ARMOR_TAGS = {"Scout": {"stealth", "radar_booster", "mobility"}, "Stationary Shroud": {"stealth"},
              "Reduced Signature": {"stealth"}, "Servo-Assisted": {"mobility"}, "Peak Physique": {"mobility"},
              "Fortified": {"static_position"}, "Siege-Ready": {"sustain_fire"}, "Inflammable": {"fire_resist_armor"}}


def entry(row):
    sec = vw.wiki_section(row)
    wb = _warbond(row)
    base = {"name": row["title"]}
    if wb:
        base["warbond"] = wb
    if sec in ("primaries", "secondaries"):
        cov, tags = weapon(row, sec)
    elif sec == "grenades":
        cov, tags = throwable(row)
    elif sec == "stratagems":
        r = stratagem(row)
        if not r:
            return None, None
        cat, cov, tags, backpack, expendable = r
        base.update(category=cat)
        if expendable:
            base["expendable"] = True
        base["backpack"] = backpack
    elif sec == "armor":
        if row.get("type") not in ("Light", "Medium", "Heavy") or not row.get("passive"):
            return None, None
        passive = row["passive"]
        tags = set(ARMOR_TAGS.get(passive, set())) | ({"light_armor"} if row["type"] == "Light" else set())
        cov = {"bc"} if tags & {"stealth"} else set()
        base.update(weight=row["type"], passive=passive)
        base.update(coverage=sorted(cov), tags=sorted(t for t in tags if t in VOCAB))
        return sec, base
    elif sec == "boosters":
        desc = re.split(r"(?<=\.)\s", row.get("description") or "")[0].rstrip(".")
        base.update(effect=desc[:70] or row["title"], role_bias="any", strong=False)
        return sec, base
    else:
        return None, None
    base.update(coverage=sorted(cov), tags=sorted(t for t in tags if t in VOCAB), grade=_grade(tags))
    return sec, base


def main():
    overrides = {}
    if "--overrides" in sys.argv:
        raw = json.load(open(sys.argv[sys.argv.index("--overrides") + 1]))
        for it in raw.get("items", []):
            e = it.get("entry") or {}
            if e.get("name"):
                overrides[vw.norm(e["name"])] = e
    cat = json.loads((ROOT / "sync" / "wiki_catalog.json").read_text())
    items = loader.items()
    have = {vw.norm(vw.page_title(r)) for s in vw.SECTIONS for r in items.get(s, [])}
    lines, counts, used_override = {s: [] for s in vw.SECTIONS}, {}, 0
    for row in cat["items"]:
        if vw.norm(row["title"]) in have or row.get("stratagem_type") in ("Objective", "Ship", "Other"):
            continue
        sec, e = entry(row)
        if not e:
            continue
        o = overrides.get(vw.norm(row["title"]))
        if o:  # researched editorial fields win where they're well-formed; facts stay the wiki's
            if isinstance(o.get("tags"), list) and all(t in VOCAB for t in o["tags"]):
                e["tags"] = o["tags"]
            if isinstance(o.get("coverage"), list) and set(o["coverage"]) <= {"at", "st", "ch", "bc"}:
                e["coverage"] = o["coverage"]
            g = o.get("grade")
            if "grade" in e and isinstance(g, dict) and set(g) == set(FACTIONS) and set(g.values()) <= set("SABCD"):
                e["grade"] = g
            if sec == "boosters" and o.get("role_bias") in {"any", "hardpoint", "hammer", "forward", "fires"}:
                e["role_bias"] = o["role_bias"]; e["strong"] = bool(o.get("strong"))
            used_override += 1
        lines[sec].append(item_line(sec, e))
        counts[sec] = counts.get(sec, 0) + 1
    append_items(lines)
    print("added:", counts, "total", sum(counts.values()), "| researched overrides used:", used_override)


if __name__ == "__main__":
    main()
