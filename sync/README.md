# Keeping the game data fresh

WARMIND's missions, hazards, tactical objectives and item tiers are **editorial**
data — Helldivers 2 has no authoritative API for them, so they can't be blindly
auto-pulled. Instead, three layers keep them from silently going out of date.

### 1. Validation gate (every push)
`validate_data.py` proves the seed is internally coherent: every mission/tactical
situation tag maps into the modifier bridge, every item tag is in the closed
kit-tag vocabulary, difficulty gates are playable, and the golden pressure target
still resolves. The `data-sync` workflow runs it on every push to the data or
scripts, so a bad edit can't reach production.

```bash
python3 sync/validate_data.py
```

### 2. Patch tripwire (daily)
`patch_watch.py` polls the Helldivers 2 Steam update feed (on a GitHub Actions
runner — the app itself has no outbound access to it). When a patch newer than the
last seen one ships, it writes the notes to `latest_patch.md`, advances
`state.json`, and the workflow opens a **`data-sync` issue** with a checklist.

### 3. Auto-drafted update (daily Claude Routine)
A scheduled Claude session watches for an unprocessed patch (`last_seen_gid` !=
`processed_gid` in `state.json`), reads `latest_patch.md`, updates
`app/warmind/data/*.yaml` to match, runs the validator, and opens a **draft PR**.
You review and merge — merging is what advances `processed_gid`. Nothing changes
the live data without a human merge.

## Files
- `validate_data.py` — the consistency gate
- `patch_watch.py` — the Steam patch-feed watcher
- `state.json` — `last_seen_gid` (advanced by the watcher) / `processed_gid` (advanced when the update PR merges)
- `latest_patch.md` — the most recent patch notes, committed for the Routine + humans to read
- `../.github/workflows/data-sync.yml` — validate on push; watch + issue daily
