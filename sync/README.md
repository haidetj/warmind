# Keeping the game data fresh

WARMIND's missions, hazards, tactical objectives and item tiers are **editorial**
data — Helldivers 2 has no authoritative API for them, so they can't be blindly
auto-pulled. Instead, three layers keep them from silently going out of date.

### 1. Validation gate (every push)
`validate_data.py` proves the seed is internally coherent: every mission/tactical
situation tag maps into the modifier bridge, every item tag is in the closed
kit-tag vocabulary, difficulty gates are playable, and the golden pressure target
still resolves. The `data-sync` workflow runs it on every push to the data or
scripts (including `data-sync/*` branches), so a bad edit can't reach production.

```bash
python3 sync/validate_data.py
```

### 2. Patch tripwire (daily)
`patch_watch.py` polls the Helldivers 2 Steam update feed (on a GitHub Actions
runner — the app itself has no outbound access to it). For **every** patch newer
than the last one seen — not just the newest, so two patches between runs are both
caught — it writes the notes to `patches/<date>-<gid>.md` (never overwritten),
appends the gid to `state.json["pending"]`, refreshes `latest_patch.md`, and the
workflow opens a **`data-sync` issue** with a checklist. A feed outage doesn't fail
the run but raises a visible warning annotation, so it can't masquerade as "no news".

### 3. Auto-drafted update (GitHub Actions, same daily run)
The `draft` job runs `draft_update.py` whenever `state.json["pending"]` is non-empty
and no data-sync PR is already open. It sends the pending patch notes, the closed
tag vocabularies and the existing names to Claude **with web search**, asking for
additions to `items.yaml` (all six sections) and `missions.yaml` as JSON, each with
source URLs. Every proposal is then checked in code: unknown tags, malformed
grades, duplicates and anything without a source are rejected and listed in the PR,
never written. Balance changes to existing gear are listed for a human, not applied.
It clears `pending`, sets `processed_gid`, runs `validate_data.py`, pushes a
`data-sync/<date>-run<N>` branch and opens a **draft PR** whose body lists what was
added (with sources), what was rejected and why, and the review checklist. If
Actions can't open PRs in this repo, it comments a one-click compare link on the
data-sync issue instead. Nothing changes the live data without a human merge.

Needs the `ANTHROPIC_API_KEY` secret under *Settings → Secrets and variables →
Actions* (the job log prints whether it's present). Run it on demand from the
Actions tab: **data-sync → Run workflow**.

`data-sync-pr.yml` still turns any manually pushed `data-sync/*` branch into a PR.

## Files
- `validate_data.py` — the consistency gate
- `patch_watch.py` — the Steam patch-feed watcher
- `draft_update.py` — drafts the sourced seed update for pending patches
- `state.json` — `pending` (gids awaiting a data update), `last_seen_*` (watcher), `processed_gid` (newest patch handled by a merged update)
- `patches/` — one notes file per detected patch, the source of truth for the update
- `latest_patch.md` — the newest patch notes, for humans skimming the repo
- `../.github/workflows/data-sync.yml` — validate on push; watch + issue daily
- `../.github/workflows/data-sync-pr.yml` — open the draft PR when a `data-sync/*` branch is pushed
