"""Load the YAML seed data. One cached read per file."""

from __future__ import annotations

import functools
import json
import pathlib

import yaml

DATA = pathlib.Path(__file__).resolve().parent / "data"


@functools.lru_cache(maxsize=None)
def _load(name: str):
    with open(DATA / name) as fh:
        return yaml.safe_load(fh)


def hazards() -> dict:
    """hazard_id -> {description, modifiers:{kit_tag: float}, ...}."""
    return _load("hazards.yaml")


def missions() -> dict:
    """mission_id -> mission record."""
    return {m["id"]: m for m in _load("missions.yaml")}


def tactical_objectives() -> dict:
    """objective_id -> record."""
    return {t["id"]: t for t in _load("tactical_objectives.yaml")}


def mission_tag_modifiers() -> dict:
    """situation_tag -> {description, modifiers:{kit_tag: float}}."""
    return _load("mission_tag_modifiers.yaml")


def operation_modifiers() -> dict:
    """Operation modifiers (Roving Shriekers, Gunship Patrols, ...): id -> record with the
    wiki's description, the faction/difficulty it appears on, and its kit-tag pressure."""
    p = DATA / "operation_modifiers.yaml"
    return {m["id"]: m for m in (_load("operation_modifiers.yaml") or [])} if p.exists() else {}


def items() -> dict:
    """The raw items.yaml (primaries, secondaries, grenades, stratagems, armor, boosters)."""
    return _load("items.yaml")


#: slots whose items a player either owns or doesn't. Classic stratagems are
#: requisition unlocks (no `warbond` field → base, always owned), but modern
#: warbonds also ship stratagems (e.g. AMW-20 Apex), and those are gated.
GATED_SLOTS = ("primaries", "secondaries", "grenades", "stratagems", "armor", "boosters")
_SLOT_LABEL = {"primaries": "Primary", "secondaries": "Secondary", "grenades": "Grenade",
               "stratagems": "Stratagem", "armor": "Armor", "boosters": "Booster"}
_BASE = {"", "Helldivers Mobilize", "Standard"}


def warbond_catalog() -> dict:
    """Gated gear grouped by source warbond, for the ownership checklist. Returns
    {"warbonds": [{"name", "items": [{"name","slot"}...]}...], "map": {item_name: warbond}}.
    Only non-base warbonds appear; base/requisition gear is always owned."""
    raw = items()
    groups: dict[str, list] = {}
    flat: dict[str, str] = {}
    for slot in GATED_SLOTS:
        for rec in raw.get(slot, []):
            wb = (rec.get("warbond") or "").strip()
            name = rec["name"]
            flat[name] = wb
            if wb in _BASE:
                continue
            groups.setdefault(wb, []).append({"name": name, "slot": _SLOT_LABEL[slot]})
    # one-off sources (events, pre-order, DLC, gifts) read better as one group
    special = {wb for wb, its in groups.items() if wb != "Superstore" and
               (len(its) <= 2 or any(k in wb for k in SPECIAL_HINTS))}
    merged: dict[str, list] = {}
    for wb, its in groups.items():
        key = SPECIAL_GROUP if wb in special else wb
        merged.setdefault(key, []).extend(dict(i, source=wb) if key == SPECIAL_GROUP else i for i in its)

    def kind(wb):
        return "special" if wb == SPECIAL_GROUP else "superstore" if wb == "Superstore" else "warbond"
    order = {"warbond": 0, "superstore": 1, "special": 2}
    warbonds = [{"name": wb, "kind": kind(wb), "items": sorted(merged[wb], key=lambda x: (x["slot"], x["name"]))}
                for wb in sorted(merged, key=lambda w: (order[kind(w)], w))]
    return {"warbonds": warbonds, "map": flat}


def is_base(wb: str) -> bool:
    """Base game / requisition / the free Helldivers Mobilize warbond."""
    return (wb or "").strip() in _BASE


SPECIAL_GROUP = "Events & special unlocks"
SPECIAL_HINTS = ("Liberty Day", "Pre-Order", "Super Citizen", "Anniversary", "Downloadable", "Gift")


def kit_tag_vocabulary() -> set[str]:
    """The closed set of kit tags, defined by hazards + situation modifiers."""
    vocab: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            for key, val in node.items():
                if key == "modifiers" and isinstance(val, dict):
                    vocab.update(val.keys())
                else:
                    walk(val)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    walk(hazards())
    for rec in mission_tag_modifiers().values():
        vocab.update((rec.get("modifiers") or {}).keys())
    for rec in operation_modifiers().values():
        vocab.update((rec.get("modifiers") or {}).keys())
    return vocab


WIKI = "https://helldivers.wiki.gg/wiki/"


def wiki_url(rec: dict) -> str:
    """The item's wiki page: the verified `wiki` field when present, else derived from the name."""
    if rec.get("wiki"):
        return rec["wiki"]
    import urllib.parse
    return WIKI + urllib.parse.quote(rec["name"].replace(" ", "_"), safe="/_-'()")


def wiki_map() -> dict:
    raw = items()
    return {r["name"]: wiki_url(r) for s in GATED_SLOTS for r in raw.get(s, [])}


# ---------------------------------------------------------------- armory: the in-game loadout menu layout
# data/armory.json (built from the wiki by sync/verify_wiki.py --armory) gives each item's
# menu group, stratagem permit colour and icon. This arranges the ownership checklist the
# way the game's loadout menu does. Only gated gear is listed — base gear is always owned.
WEAPON_ORDER = ["Assault Rifles", "Marksman Rifles", "Sniper Rifles", "Submachine Guns", "Shotguns",
                "Explosives", "Energy-Based", "Pistols", "Melee", "Standard", "Special", "Other"]
PERMITS = [("Offensive", ["Orbital", "Eagle"]), ("Supply", ["Support Weapons", "Backpacks", "Vehicles"]),
           ("Defensive", ["Sentries", "Emplacements"])]


def armory_meta() -> dict:
    p = DATA / "armory.json"
    return json.loads(p.read_text()) if p.exists() else {}


def pictures() -> dict:
    """{item name: {"icon": stratagem icon, "img": render, "permit": stratagem permit}} for items with a picture."""
    return {k: {x: v[x] for x in ("icon", "img", "permit") if v.get(x)} for k, v in armory_meta().items()
            if v.get("icon") or v.get("img")}


BASE_SOURCE = "Base game"
MOBILIZE = "Helldivers Mobilize"


def sources() -> dict:
    """Where each item comes from, for the gear filter: {"of": {item: source},
    "list": [{"name", "kind", "n"}...]} in menu order: base game, the free warbond,
    premium warbonds, Superstore, one-off events."""
    cat = warbond_catalog()
    of = {}
    for name, wb in cat["map"].items():
        wb = (wb or "").strip()
        of[name] = MOBILIZE if wb == MOBILIZE else BASE_SOURCE if is_base(wb) else None
    for w in cat["warbonds"]:
        for i in w["items"]:
            of[i["name"]] = w["name"]
    novelty = {r["name"] for s in GATED_SLOTS for r in items().get(s, []) if r.get("novelty")}
    counts: dict = {}
    for n, sname in of.items():
        if n not in novelty:
            counts[sname] = counts.get(sname, 0) + 1
    kinds = {w["name"]: w["kind"] for w in cat["warbonds"]}
    kinds.update({BASE_SOURCE: "base", MOBILIZE: "base"})
    order = {"base": 0, "warbond": 1, "superstore": 2, "special": 3}
    lst = sorted(({"name": k, "kind": kinds.get(k, "warbond"), "n": v} for k, v in counts.items()),
                 key=lambda x: (order[x["kind"]], x["name"] != BASE_SOURCE, x["name"]))
    return {"of": of, "list": lst}


def armory() -> list:
    meta, raw, src = armory_meta(), items(), sources()["of"]

    def entry(rec):
        m = meta.get(rec["name"], {})
        e = {"name": rec["name"], "source": src.get(rec["name"], BASE_SOURCE), "icon": m.get("icon"), "img": m.get("img")}
        if m.get("stats"):
            e["stats"] = m["stats"]
        return e

    out = []
    for slot in GATED_SLOTS:
        listed = [r for r in raw.get(slot, []) if not r.get("novelty")]   # the whole library, base gear included
        groups: dict = {}
        for r in listed:
            m = meta.get(r["name"], {})
            if slot == "stratagems":
                pm = (m.get("permit") or "Supply").strip().title()
                pm = "Offensive" if pm.startswith("Offens") else "Defensive" if pm.startswith("Defens") else pm
                key = (pm, m.get("group") or "Other")
            elif slot == "armor":
                key = (None, r.get("weight") or "Other")
            elif slot == "boosters":
                key = (None, "Boosters")
            else:
                key = (None, m.get("group") or "Other")
            groups.setdefault(key, []).append(entry(r))

        def order(k):
            permit, g = k
            if slot == "stratagems":
                for i, (pm, subs) in enumerate(PERMITS):
                    if pm == permit:
                        return (i, subs.index(g) if g in subs else 9)
                return (9, 9)
            if slot == "armor":
                return (["Light", "Medium", "Heavy"].index(g) if g in ("Light", "Medium", "Heavy") else 9, 0)
            return (WEAPON_ORDER.index(g) if g in WEAPON_ORDER else 99, 0)
        out.append({"slot": _SLOT_LABEL[slot], "groups": [
            {"permit": k[0], "group": k[1], "items": sorted(groups[k], key=lambda x: x["name"])}
            for k in sorted(groups, key=order)]})
    return out
