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
