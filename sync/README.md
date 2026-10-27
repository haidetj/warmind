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

### 3. Auto-drafted update (daily Claude scheduled task → GitHub Action)
A scheduled Claude session checks `state.json["pending"]`. If anything is pending it
reads each patch file, updates `app/warmind/data/*.yaml` (web-verifying names the
notes leave vague — it never invents names), clears `pending`, sets
`processed_gid`, runs the validator, and **pushes a `data-sync/<date>` branch**
with its per-file summary + review checklist in the commit message.

The `data-sync-pr` workflow turns that push into a **draft PR** (commit message →
PR body, plus `Closes #N` for the open data-sync issues). The Claude session only
needs git for this — it does not need GitHub API tools. If the repo setting *Allow
GitHub Actions to create and approve pull requests* is off, the workflow instead
comments a one-click compare link on the data-sync issue, so an update is never
silently stranded. You review and merge; merging deploys. Nothing changes the
live data without a human merge.

## Files
- `validate_data.py` — the consistency gate
- `patch_watch.py` — the Steam patch-feed watcher
- `state.json` — `pending` (gids awaiting a data update), `last_seen_*` (watcher), `processed_gid` (newest patch handled by a merged update)
- `patches/` — one notes file per detected patch, the source of truth for the update
- `latest_patch.md` — the newest patch notes, for humans skimming the repo
- `../.github/workflows/data-sync.yml` — validate on push; watch + issue daily
- `../.github/workflows/data-sync-pr.yml` — open the draft PR when a `data-sync/*` branch is pushed
