#!/usr/bin/env python3
"""Draft a WARMIND seed update for every pending HD2 patch (GitHub Actions).

Reads the patch notes queued in sync/state.json["pending"], asks Claude (with web
search, so every name is sourced, never invented) to propose additions to
items.yaml and missions.yaml as JSON, validates each proposal in code against the
closed vocabularies, appends the survivors, and runs validate_data.py. The
workflow then pushes a data-sync/<date> branch and opens a draft PR. Nothing
reaches the live app without a human merge.

Exit codes: 0 = drafted (or nothing pending), 1 = error, 3 = no API key.
Writes sync/.draft_summary.md (PR body) for the workflow.

    ANTHROPIC_API_KEY=... python3 sync/draft_update.py
"""

from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SYNC = ROOT / "sync"
DATA = ROOT / "app" / "warmind" / "data"
sys.path.insert(0, str(ROOT / "app"))

from warmind import loader  # noqa: E402

MODEL = os.environ.get("WARMIND_DRAFT_MODEL", "claude-opus-5-5")
SUMMARY = SYNC / ".draft_summary.md"

AXES = {"at", "st", "ch", "bc"}
FACTIONS = {"terminids", "automatons", "illuminate"}
GRADES = {"S", "A", "B", "C", "D"}
WEIGHTS = {"Light", "Medium", "Heavy"}
CATEGORIES = {"support", "backpack", "eagle", "orbital", "sentry", "emplacement", "mine", "relay"}
SECTIONS = ("primaries", "secondaries", "grenades", "stratagems", "armor", "boosters")

PROMPT = """You maintain the game data for WARMIND, a Helldivers 2 squad-loadout coach.
New patch notes arrived (below). Propose additions to the data so the app knows
about new gear and missions. Use web search to confirm exact in-game names and
details the notes leave vague (wiki.gg, Fandom, the official Steam news, reputable
guides). NEVER invent a name, designation or stat: if you can't confirm something
from a source, put it under "skipped" with the reason instead.

Only ADD entries that are missing; never repeat an existing name (list below).
Balance changes to existing gear: don't edit anything, list them under "review" so
a human can re-grade.

Field rules (they are validated; anything else is dropped):
- coverage: subset of [at, st, ch, bc] (at=kills heavy armour, st=destroys
  structures, ch=clears chaff, bc=breaks contact).
- tags: subset of this closed kit-tag vocabulary: {vocab}
- grade: {{terminids, automatons, illuminate}} each one of S A B C D. These are
  provisional judgement; be conservative (B unless sources clearly say otherwise).
- warbond: the exact warbond name the item comes from, or omit for base-game /
  requisition items.
- stratagems also need: category (one of {categories}) and backpack (true if it
  occupies the backpack slot).
- armor needs: weight (Light|Medium|Heavy) and passive (exact passive name).
- boosters need: effect (short phrase), role_bias (one of {role_bias}), strong (bool).
- missions need: id (snake_case), display_name, archetype, factions (subset of
  terminids/automatons/illuminate), duration_band, difficulty_min, difficulty_max,
  tags (subset of these situation tags: {situation}).

Existing item names: {items}
Existing mission names: {missions}

Example item entries already in the data (match their shape):
{examples}

Reply with your research as needed, then END with exactly one ```json fenced block:
{{
  "summary": "one paragraph: what these patches add that matters for loadouts",
  "items": [{{"section": "primaries|secondaries|grenades|stratagems|armor|boosters",
             "entry": {{...fields as above, including "name"...}},
             "sources": ["https://..."]}}],
  "missions": [{{"entry": {{...}}, "sources": ["https://..."]}}],
  "review": ["balance change or rework a human should re-grade, with source"],
  "skipped": [{{"what": "...", "why": "..."}}]
}}

PATCH NOTES
{notes}
"""


def log(msg):
    print(msg, flush=True)


def load_state():
    return json.loads((SYNC / "state.json").read_text())


def pending_notes(state):
    out = []
    for gid in state.get("pending", []):
        hits = sorted((SYNC / "patches").glob(f"*-{gid}.md"))
        if hits:
            out.append((gid, hits[-1].read_text()))
        else:
            log(f"::warning::pending patch {gid} has no notes file in sync/patches/")
    return out


def ask_claude(prompt: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 12},
             {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 8}]
    messages = [{"role": "user", "content": prompt}]
    # server-side tool loops can pause; resend the turn so the server resumes it
    for _ in range(6):
        with client.beta.messages.stream(
            model=MODEL, max_tokens=32000,
            thinking={"type": "adaptive"}, output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            tools=tools, messages=messages,
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            raise RuntimeError(f"model declined: {getattr(msg.stop_details, 'category', None)}")
        if msg.stop_reason != "pause_turn":
            break
        messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": msg.content}]
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("reply hit max_tokens before the JSON block")
    return "".join(b.text for b in msg.content if b.type == "text")


def extract_json(text: str) -> dict:
    blocks = re.findall(r"```json\s*(.*?)```", text, re.S)
    if not blocks:
        raise ValueError("no ```json block in the reply")
    return json.loads(blocks[-1])


# ---------------------------------------------------------------- validation
def _subset(v, allowed):
    return isinstance(v, list) and all(isinstance(x, str) and x in allowed for x in v)


def check_item(section, e, vocab, role_bias, existing) -> str | None:
    name = e.get("name")
    if not isinstance(name, str) or not name.strip():
        return "missing name"
    if name.lower() in existing:
        return "already in the data"
    if "warbond" in e and not isinstance(e["warbond"], str):
        return "warbond must be a string"
    if section == "boosters":
        if not isinstance(e.get("effect"), str):
            return "booster needs effect"
        if e.get("role_bias") not in role_bias:
            return f"role_bias must be one of {sorted(role_bias)}"
        if not isinstance(e.get("strong"), bool):
            return "booster needs strong: true/false"
        return None
    if not _subset(e.get("coverage"), AXES):
        return "coverage must be a subset of at/st/ch/bc"
    if not _subset(e.get("tags"), vocab):
        bad = [t for t in e.get("tags") or [] if t not in vocab]
        return f"unknown tags {bad}"
    if section == "armor":
        if e.get("weight") not in WEIGHTS or not isinstance(e.get("passive"), str):
            return "armor needs weight Light/Medium/Heavy and passive"
        return None
    g = e.get("grade")
    if not isinstance(g, dict) or set(g) != FACTIONS or not all(v in GRADES for v in g.values()):
        return "grade needs terminids/automatons/illuminate each S-D"
    if section == "stratagems":
        if e.get("category") not in CATEGORIES or not isinstance(e.get("backpack"), bool):
            return "stratagem needs category and backpack"
    return None


def check_mission(e, situation, existing_ids, existing_names) -> str | None:
    if not re.fullmatch(r"[a-z0-9_]+", str(e.get("id", ""))):
        return "id must be snake_case"
    if e["id"] in existing_ids or str(e.get("display_name", "")).lower() in existing_names:
        return "already in the data"
    if not isinstance(e.get("display_name"), str):
        return "missing display_name"
    if not _subset(e.get("factions"), FACTIONS) or not e["factions"]:
        return "factions must be a non-empty subset of the three factions"
    lo, hi = e.get("difficulty_min"), e.get("difficulty_max")
    if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 10):
        return "difficulty gate must satisfy 1 <= min <= max <= 10"
    if not _subset(e.get("tags", []), situation):
        return f"unknown situation tags {[t for t in e.get('tags', []) if t not in situation]}"
    return None


# ---------------------------------------------------------------- writing
def _flow(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "[" + ", ".join(_flow(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}: {_flow(x)}" for k, x in v.items()) + "}"
    s = str(v)
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", s) and s.lower() not in ("true", "false", "null", "yes", "no", "on", "off"):
        return s                                     # bare identifiers, like the hand-written entries
    return json.dumps(s, ensure_ascii=False)     # JSON strings are valid YAML


ITEM_ORDER = ["name", "warbond", "slot", "category", "weight", "passive", "effect", "role_bias",
              "strong", "coverage", "tags", "backpack", "expendable", "grade"]


def item_line(section, e):
    e = dict(e)
    if section == "stratagems":
        e["slot"] = "stratagem"
    keys = [k for k in ITEM_ORDER if k in e]
    return "  - {" + ", ".join(f"{k}: {json.dumps(e[k]) if k == 'name' else _flow(e[k])}" for k in keys) + "}"


def append_items(lines_by_section):
    path = DATA / "items.yaml"
    text = path.read_text().splitlines()
    heads = [i for i, ln in enumerate(text) if re.match(r"^[a-z_]+:\s*$", ln)]
    for section, new in lines_by_section.items():
        if not new:
            continue
        start = next(i for i in heads if text[i].startswith(section + ":"))
        nxt = [i for i in heads if i > start]
        end = nxt[0] if nxt else len(text)
        # insert after the section's last entry (before trailing blanks/comments)
        j = end
        while j > start + 1 and not text[j - 1].lstrip().startswith("- "):
            j -= 1
        text[j:j] = new
        heads = [i for i, ln in enumerate(text) if re.match(r"^[a-z_]+:\s*$", ln)]
    path.write_text("\n".join(text) + "\n")


def append_missions(entries):
    if not entries:
        return
    out = ["", "# --- added by the data-sync drafter; review against the sources in the PR ---"]
    for e in entries:
        out.append(f"- id: {e['id']}")
        for k in ("display_name", "archetype", "factions", "duration_band", "difficulty_min", "difficulty_max", "tags"):
            if k in e:
                out.append(f"  {k}: {_flow(e[k])}")
    path = DATA / "missions.yaml"
    path.write_text(path.read_text().rstrip("\n") + "\n" + "\n".join(out) + "\n")


# ---------------------------------------------------------------- main
def main() -> int:
    state = load_state()
    notes = pending_notes(state)
    if not notes:
        log("Nothing pending — data is current.")
        return 0
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log("::error title=ANTHROPIC_API_KEY missing::Add it under Settings → Secrets and variables → Actions.")
        return 3
    log(f"Drafting for {len(notes)} pending patch(es): {[g for g, _ in notes]}")

    vocab = loader.kit_tag_vocabulary()
    situation = set(loader.mission_tag_modifiers())
    items = loader.items()
    role_bias = {b.get("role_bias") for b in items.get("boosters", [])} - {None}
    existing = {it["name"].lower() for s in SECTIONS for it in items.get(s, [])}
    missions = loader.missions()
    m_names = {m["display_name"].lower() for m in missions.values()}
    examples = "\n".join(f"{s}: {_flow(items[s][-1])}" for s in SECTIONS if items.get(s))

    prompt = PROMPT.format(
        vocab=", ".join(sorted(vocab)), categories=", ".join(sorted(CATEGORIES)),
        role_bias=", ".join(sorted(role_bias)), situation=", ".join(sorted(situation)),
        items="; ".join(sorted(it["name"] for s in SECTIONS for it in items.get(s, []))),
        missions="; ".join(sorted(m["display_name"] for m in missions.values())),
        examples=examples,
        notes="\n\n---\n\n".join(f"[patch {g}]\n{n}" for g, n in notes),
    )
    reply = ask_claude(prompt)
    proposal = extract_json(reply)

    accepted, rejected, by_section, new_missions = [], [], {s: [] for s in SECTIONS}, []
    for p in proposal.get("items", []):
        sec, e, src = p.get("section"), p.get("entry") or {}, p.get("sources") or []
        why = "no source URL" if not src else ("unknown section" if sec not in SECTIONS else
                                                check_item(sec, e, vocab, role_bias, existing))
        if why:
            rejected.append((e.get("name", "?"), why))
            continue
        existing.add(e["name"].lower())
        by_section[sec].append(item_line(sec, e))
        accepted.append((sec, e["name"], e.get("warbond"), src))
    for p in proposal.get("missions", []):
        e, src = p.get("entry") or {}, p.get("sources") or []
        why = "no source URL" if not src else check_mission(e, situation, set(missions), m_names)
        if why:
            rejected.append((e.get("display_name", "?"), why))
            continue
        new_missions.append(e)
        accepted.append(("missions", e["display_name"], None, src))

    append_items(by_section)
    append_missions(new_missions)

    newest = notes[-1][0]
    state["pending"] = [g for g in state.get("pending", []) if g not in {g for g, _ in notes}]
    state["processed_gid"] = newest
    (SYNC / "state.json").write_text(json.dumps(state, indent=2) + "\n")

    val = subprocess.run([sys.executable, str(SYNC / "validate_data.py")], capture_output=True, text=True)

    md = [f"Auto-drafted from {len(notes)} patch(es) by `sync/draft_update.py` "
          f"({dt.date.today().isoformat()}). Every added entry cites its sources; review them before merging.",
          "", "### Summary", proposal.get("summary", "(none)"), "", "### Added"]
    md += [f"- **{n}** ({sec}{', ' + wb if wb else ''}): " + ", ".join(src[:3]) for sec, n, wb, src in accepted] or ["- nothing"]
    if proposal.get("review"):
        md += ["", "### Needs a human (balance changes, not auto-applied)"] + [f"- [ ] {r}" for r in proposal["review"]]
    if rejected:
        md += ["", "### Proposed but rejected by validation"] + [f"- {n}: {w}" for n, w in rejected]
    if proposal.get("skipped"):
        md += ["", "### Not added (couldn't be confirmed)"] + [f"- {s.get('what')}: {s.get('why')}" for s in proposal["skipped"]]
    md += ["", "### Review checklist",
           "- [ ] Names match the in-game names (check the sources)",
           "- [ ] Grades are sensible (they're provisional priors)",
           f"- [ ] `validate_data.py`: {'PASSED' if val.returncode == 0 else 'FAILED — see below'}"]
    if val.returncode != 0:
        md += ["", "```", (val.stdout + val.stderr)[-3000:], "```"]
    SUMMARY.write_text("\n".join(md) + "\n")
    log("\n".join(md))
    return 0


if __name__ == "__main__":
    sys.exit(main())
