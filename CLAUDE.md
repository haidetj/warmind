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
One set per diver: while the planner works the briefing shows a single "building your loadouts"
screen (no engine picks). The finished set is pinned under `mind.brief_key` (mission, reroll,
squad, each diver's stated preferences), so background changes (gear ticks, stat re-reads) never
swap kits; only gear a diver no longer owns is refilled. Past `WARMIND_PLAN_SLOW_S` (100s), or on
failure / budget, the engine's set is pinned instead and stays.
Env: `WARMIND_PLANNER=0` turns it off, `WARMIND_PLAN_MODEL` (defaults to
`WARMIND_MODEL`), `WARMIND_PLAN_EFFORT` (default medium), caps
`WARMIND_PLAN_PER_LOBBY_HOUR` (20) / `WARMIND_PLAN_PER_DAY` (150). `/health` →
`planner.last` shows the latest plan's status, error and token usage.
Challenge / D100 "ask" ratings live in `app/warmind/data/ask.yaml`.

## War rooms, roster, profiles
- Profile = locker (`x-locker` header). You are your callsign: home, war tables and the locker
  open behind a sign-in gate (callsign + 4–8 digit PIN, `/api/signin`; PBKDF2 hash on the locker).
  A new callsign creates the profile in the same step, unless it looks like a typo of an existing
  one ("did you mean"). Pre-PIN profiles take the first PIN entered. Callsigns are unique.
  Tables record `lobby.creator_locker`; `/api/locker/{id}/tables` hands a signed-in device its
  creator tokens and seats, so a diver's tables, creator rights and seat follow them to any device.
  Home lands on the Profile tab (Profile / Front / War rooms / War tables / Roster / Welcome); the tab is
  kept in the URL (`?tab=`) so back links return to it.
- `?roster` lists public lockers (opt-out switch in the locker); `?roster=<id>` is a public profile.
- `?room=<id>` is a war room: the squad's lasting home. Tables created with `room_id` open on the
  room's mission; standing orders (`room_order`) are tracked from every debrief in the room's tables
  (`_room_tally`); ribbons and the ship's log (`room_log`, i18n keys `log.*`) build up over time.
  Anyone with the room code can set the mission; only the founder (token in `wm_roomc_<id>`, or the
  founder's profile) renames it, sets standing orders, pins the crew message and names awards. Joining a room table with a locker makes you a member, and your
  rooms follow your locker into the new-table picker.
- Awards the founder names (`room_award`, `award_grant`): the founder creates an award (name, what it's for,
  one of `AWARD_ICONS`) and gives it to crew members (room members only) with an optional citation; they can
  take one back or retire the award (holders keep retired awards). Awards show on the room page, the
  diver's Profile / locker / public profile, their Discord diver card, and in the ship's log (`log.award`).
- A diver can ask for a role (`prefs.role`: HARDPOINT, HAMMER, …) and set their play style on the Profile tab or
  at the war table; both live on the locker and follow them (`_with_wants` adds role requests to the creator's
  swaps: the creator's call wins, then first to ask). A Profile play style reaches unbriefed seats only.
- Go / No-Go: `player.go`, shown in the war table's command panel.
- D100 is the hardest kit that still answers the mission: no crutches (`ask.is_crutch`), Light armour,
  no safety-net boosters (`ask.D100_NO_BOOST`); the planner can't override that.

## Costs (`app/costs.py`, `/?costs`)
Every Claude call records its `usage` (input, cache write/read, output) into `api_usage`, priced
at list rates (`costs.PRICES`, override with `WARMIND_PRICES`), tagged by kind (plan, career,
result, review, mission, squad). With an Admin API key (sk-ant-admin..., in `ANTHROPIC_ADMIN_KEY` or any env var whose value starts with it)
a background thread polls `GET /v1/organizations/cost_report` every 30 min (whole org, daily
USD) into `kv.cost_report`. `/api/costs` serves both; `/?costs` shows them (polls every 60s);
`/health` → `costs` has a one-line summary. Hosting has no billing API: `WARMIND_HOSTING_USD_MONTH`.

## Discord (`app/discord_app.py`, `app/cards.py`)
No server admin needed, works across every server and channel:
- Link previews: `/` injects Open Graph tags for `?l=`, `?room=`, `?roster=` links; the picture is
  `/card/{table|room|diver}/{id}.png` (Pillow, JetBrains Mono from `app/fonts`, `?v=` = content hash so
  Discord re-fetches when the card changes). Any pasted WARMIND link unfurls into a live card.
- `/warmind` (table / room / diver / front): a user-installable Discord app. Each diver adds it to their
  own account once (Profile → "Add WARMIND to my Discord", `integration_type=1`), then uses it in any
  server that allows external apps. Pickers autocomplete recent tables, rooms and callsigns; cards
  carry "Open in WARMIND" and "Refresh". Interactions hit `POST /api/discord/interactions`
  (Ed25519-verified). Env: `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY` (required), `DISCORD_BOT_TOKEN`
  (registers the command at startup). `/health` → `discord` shows registration status.
- Saved loadouts: the ⋮ menu has Edit / Share as PNG / Delete; the PNG is drawn client-side
  (`shareLoadoutPng`) and goes to the phone's share sheet, else downloads.
