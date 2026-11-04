# WARMIND — notes for working sessions

## Start of every session: review the feedback backlog
Squad members send feedback from the app (✎ Feedback button). A daily workflow
(`.github/workflows/feedback-sync.yml`) turns each one into a GitHub issue
labelled `feedback` in this repo. At the start of a session, list the open
`feedback` issues, summarise them for the user (group duplicates, flag bugs
first), and agree what to pick up. Close an issue (with a short comment) when
it's done or declined.

## Deploys
Merging to `main` deploys to Render (restart: about a minute of 502s). Don't
deploy while the squad is playing; ask first. `health.yml` runs after every
deploy and waits for the deployed commit.

## Data
Item / armour / stratagem facts, pictures, weapon stats, armour passives,
operation modifiers and hazards come from helldivers.wiki.gg via
`sync/verify_wiki.py` on GitHub Actions (this sandbox can't reach the wiki).

## WARMIND thinks (AI planner, `app/mind.py`)
After the rules engine fills the kits, one Claude call per distinct squad + mission +
reroll re-picks them with the full context (mission, hazards, modifiers, oaths, mode,
each diver's career rates and drills, ranked shortlists of owned gear with stats and
"ask"). Every pick goes back through `resolve_squad(override=...)`, so ownership, kit
rules and the squad review still hold. Plans are cached in the `plan` table.
Env: `WARMIND_PLANNER=0` turns it off, `WARMIND_PLAN_MODEL` (defaults to
`WARMIND_MODEL`), `WARMIND_PLAN_EFFORT` (default medium), caps
`WARMIND_PLAN_PER_LOBBY_HOUR` (20) / `WARMIND_PLAN_PER_DAY` (150). `/health` →
`planner.last` shows the latest plan's status, error and token usage.
Challenge / D100 "ask" ratings live in `app/warmind/data/ask.yaml`.
