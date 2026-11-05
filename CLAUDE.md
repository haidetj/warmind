# WARMIND — notes for working sessions

## Start of every session: review the feedback backlog
Squad members send feedback from the app (✎ Feedback button). A daily workflow
(`.github/workflows/feedback-sync.yml`) turns each one into a GitHub issue
labelled `feedback` in this repo. At the start of a session, list the open
`feedback` issues, summarise them for the user (group duplicates, flag bugs
first), and agree what to pick up. Close an issue (with a short comment) when
it's done or declined.

## Who and how
WARMIND is a phone-first app, used by a Discord squad on their phones, and built by one
engineer (the user) who usually works from a phone. So: check every UI change at phone
widths first (360 and 448 px, then desktop); keep replies short and say clearly what, if
anything, the user has to do; when they say "push" / "push all" / "deploy", merge and deploy.

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

## War rooms, roster, profiles
- Profile = locker (device-keyed, `x-locker` header). Home asks for a callsign first.
- `?roster` lists public lockers (opt-out switch in the locker); `?roster=<id>` is a public profile.
- `?room=<id>` is a war room: the squad's lasting home. Tables created with `room_id` open on the
  room's mission; standing orders (`room_order`) are tracked from every debrief in the room's tables
  (`_room_tally`); ribbons and the ship's log (`room_log`, i18n keys `log.*`) build up over time.
  Anyone with the room code can set the mission and orders; only the founder (token in
  `wm_roomc_<id>`) renames it. Joining a room table with a locker makes you a member, and your
  rooms follow your locker into the new-table picker.
- Go / No-Go: `player.go`, shown in the war table's command panel.
- D100 is the hardest kit that still answers the mission: no crutches (`ask.is_crutch`), Light armour,
  no safety-net boosters (`ask.D100_NO_BOOST`); the planner can't override that.
