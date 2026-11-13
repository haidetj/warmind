"""Ask WARMIND: questions about Helldivers 2 stats, gear and tactics, answered with what WARMIND knows.

One Claude call per question. The context is what the app holds that the model doesn't: the diver's
own career numbers and enriched stats, their Tuning notes and recent kits, the war table they're at
(mission, conditions, squad kits, the operation so far), the live war, and the app's data for every
item the question names (wiki stats, armour passives, "ask", coverage, grades per front). The model
brings its own knowledge of the game for the rest and says when something may have changed in a patch.
"""

from __future__ import annotations

import json
import os
import re

import httpx

import vision
from warmind import ask as ask_mod, fronts, loader
from warmind.items import Pool

MODEL = os.environ.get("WARMIND_ASK_MODEL") or vision.MODEL
MAX_Q = 600

SYSTEM = """You are WARMIND, the squad coach inside a Helldivers 2 companion app used by one friend group. \
A diver is asking you something: a stat, a weapon or stratagem, how to beat an enemy, what to bring, how \
they're doing. Answer like the coach who has every number in front of them.

- The JSON context is authoritative: the diver's own career numbers, their Tuning notes and recent kits, the war \
table they're at, the live war, and the app's data for items named in the question. Use it and cite its numbers.
- Beyond it, use your own knowledge of Helldivers 2. If a fact may have changed in a patch (damage, armour \
values, cooldowns), say so briefly. Never invent a number you don't have.
- Be concrete and short, for a phone: lead with the answer, then at most 3-5 tight bullets. About 120 words \
unless they ask for depth. No preamble, no sign-off.
- Recommending gear: prefer what the diver owns (owned list) and say what it costs them to swap.
- Keep official names (items, stratagems, enemies, missions) in English. Answer in the language you're told."""


# words too common in item names to identify one on their own
_GENERIC = {"cannon", "rifle", "sentry", "strike", "eagle", "orbital", "armor", "armour", "launcher", "grenade",
            "pistol", "shotgun", "machine", "light", "heavy", "medium", "barrage", "bombs", "mortar", "shield",
            "generator", "backpack", "guard", "laser", "flamethrower", "precision", "carbine", "rocket", "turret",
            "station", "booster", "support", "sniper", "assault", "energy", "blast", "napalm", "smoke", "impact",
            "incendiary", "anti-tank", "anti-materiel", "airstrike", "cluster", "gatling", "walking", "legacy",
            "concussive", "penetrator", "special", "standard"}


def _items_named(text: str, limit: int = 12) -> list:
    """The items a question names: full names, or the model code alone ("AC-8", "GR-8"), or the
    distinctive word ("Quasar", "Railgun")."""
    low = text.lower()
    found = []
    for it in Pool().all_items():
        n = it.name.lower()
        code, _, rest = it.name.partition(" ")
        words = [w for w in re.split(r"[^a-z0-9-]+", rest.lower()) if len(w) >= 5 and w not in _GENERIC]
        hit = n in low or (re.search(r"\b" + re.escape(code.lower()) + r"\b", low) and "-" in code) \
            or any(re.search(r"\b" + re.escape(w) + r"s?\b", low) for w in words)
        if hit and it not in found:
            found.append(it)
        if len(found) >= limit:
            break
    return found


def _item_fact(it) -> dict:
    meta = loader.armory_meta().get(it.name) or {}
    v, why = ask_mod.ask(it)
    out = {"name": it.name, "slot": it.slot, "category": it.category or None, "stats": meta.get("stats") or None,
           "passive": it.passive or None, "weight": it.weight or None, "covers": sorted(it.coverage) or None,
           "tags": sorted(it.tags) or None, "grade_per_front": it.grade or None,
           "ask": round(v, 2) if v is not None else None, "ask_why": why or None,
           "backpack": it.backpack or None, "warbond": it.warbond or None}
    if it.slot == "grenade":
        out["kills_spawners"] = {f: fronts.verdict(it.name, f) for f in ("terminids", "automatons", "illuminate")}
    return {k: v for k, v in out.items() if v not in (None, [], {})}


def build(question: str, history: list, ctx: dict, lang: str) -> tuple[str, list, list]:
    q = " ".join(str(question or "").split())[:MAX_Q]
    convo = " ".join(str(h.get("text") or "") for h in history[-6:])
    items = [_item_fact(it) for it in _items_named(q + " " + convo)]
    brief = dict(ctx, items_named=items or None, language=vision.LANG_NAMES.get(lang, "English"))
    msgs = []
    for h in history[-6:]:
        role = "assistant" if h.get("role") == "assistant" else "user"
        txt = " ".join(str(h.get("text") or "").split())[:900]
        if txt and (not msgs or msgs[-1]["role"] != role):
            msgs.append({"role": role, "content": txt})
    if msgs and msgs[0]["role"] == "assistant":
        msgs = msgs[1:]
    if msgs and msgs[-1]["role"] == "user":   # keep strict alternation: the new question is the last user turn
        msgs = msgs[:-1]
    msgs.append({"role": "user", "content": "Context (JSON):\n" + json.dumps(brief, ensure_ascii=False, separators=(",", ":"))
                 + "\n\nQuestion: " + q})
    return SYSTEM, msgs, [i["name"] for i in items]


def answer(question: str, history: list, ctx: dict, lang: str = "en") -> str:
    system, msgs, named = build(question, history, ctx, lang)
    if vision.MOCK:
        return ("(mock) WARMIND would answer here, from your numbers" + (", the war table" if ctx.get("table") else "")
                + (" and the data for " + ", ".join(named) if named else "") + ". Set ANTHROPIC_API_KEY for real answers.")
    headers = {"x-api-key": vision.API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    body = {"model": MODEL, "max_tokens": 1200,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": msgs}
    with httpx.Client(timeout=60) as client:
        r = client.post(f"{vision.BASE_URL}/v1/messages", headers=headers, json=body)
        if r.status_code >= 400:
            raise RuntimeError(f"API {r.status_code}: {r.text[:200]}")
        data = r.json()
    import costs
    costs.record("ask", data.get("model") or MODEL, data.get("usage"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if data.get("stop_reason") == "max_tokens":
        text = vision._whole_sentences(text)
    return text or "…"
