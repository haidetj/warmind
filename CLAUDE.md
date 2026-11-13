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
The planner also gets, per diver: `this_operation` (their earlier missions at this table: kit, numbers, oaths, lesson —
evolve the kit, say what was kept / changed), `recent_kits` (last 5 kits elsewhere — don't hand the same kit back;
never repeat in Fun), and `tuning`. Debriefs store the kit fought with (`result.kit`, `_kit_of`) to feed both
(`server._history_for`). In Challenge / D100 the plan carries a `challenge` {name, brief, checks}; checks use a fixed
vocabulary (`mind.CHECK_KINDS`: max/min stratagems of a category, no backpack, no support weapon, armour weight) and
`mind.check_kit` reads each final kit, so the briefing's challenge card says whose kit holds it (`held`).

## Ask WARMIND (`app/askwm.py`, `POST /api/ask`)
The ◈ WARMIND button top-left of every page opens a chat: stats, gear, tactics. One Claude call per question
(kind `ask`, `WARMIND_ASK_MODEL` defaults to `WARMIND_MODEL`, max 1200 tokens, cached system prompt). Context
(`server._ask_context`): the diver's career rates / totals / enriched stats, Tuning, lessons, recent and saved kits, owned
gear; the war table when asked from one (mission, conditions, squad kits, operation); the live war (Major Orders,
busiest planets); and app data for every item the question names (`askwm._items_named`: full name, model code or a
distinctive word). Signed-in only; caps `WARMIND_ASK_PER_DIVER_DAY` (30) / `WARMIND_ASK_PER_DAY` (200). The
conversation stays in the tab (sessionStorage, last 6 turns sent). At a war table the suggested questions are about its mission, front, planet and kit.

## Logic tab (`?logic`, 🧠 in the nav) and the journey test
`app/warmind/data/logic.yaml` is WARMIND's decision system and user journeys as data: the system map (inputs → decide →
remember → show, each node typed user / llm / rules / db / external), the decision pipelines step by step (with the code
that does each, LLM cost kinds and fallbacks), the hard-coded concepts, the journeys (persona, goal, business value,
metric, steps with the nodes they touch, friction, `ux` ideas still open, `shipped` improvements) and the architect's notes (principles, failure modes,
flywheel). `GET /api/logic` serves it plus live numbers (counts, 30-day calls and average cost per kind, caps, planner
status; no player data). `renderLogic` draws it (Map / Decisions / Rules / Journeys / Architect). Keep it true to the
code when the code changes. Journey steps with a `probe` ({url, expect, click?}) are the test plan: `node
tests/journeys.js [url]` (mock-mode server, see `tests/README.md`) opens each at 360 / 448 px and fails on a missing
selector, a page error or sideways scroll.

## War rooms, roster, profiles
- Profile = locker (`x-locker` header). You are your callsign: home, war tables and the locker
  open behind a sign-in gate (callsign + 4–8 digit PIN, `/api/signin`; PBKDF2 hash on the locker).
  A new callsign creates the profile in the same step, unless it looks like a typo of an existing
  one ("did you mean"). Pre-PIN profiles take the first PIN entered. Callsigns are unique.
  Tables record `lobby.creator_locker`; `/api/locker/{id}/tables` hands a signed-in device its
  creator tokens and seats, so a diver's tables, creator rights and seat follow them to any device.
  Home lands on the Home tab (Home / Profile / War tables / War rooms / Roster, switched only from the bottom nav;
  no top tabs). The tab is kept in the URL (`?tab=`, Home is `/`, Profile `?tab=me`; old `?tab=front` opens Home).
  Home (`homePane`, `GET /api/locker/{id}/home`): the Major Order, the open standing orders of your war rooms with
  progress, the medals in play at your open tables (this mission's oaths until you debrief, whole-operation oaths and how
  they stand), your latest medals, then the front (planets, "War table here"), the field manual and how-it-works.
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
- Debriefs (`vision.write_aar`): the review ends with a `LESSON:` line (one kit change for next time), split off
  into `result.lesson`; a review cut by the token limit is trimmed to its last whole sentence. A diver's latest
  lessons (`db.locker_lessons`) go to the planner as `last_debriefs_said` and back into the next review.
- Saved loadouts at the table (`player.kit_choice`, `POST /api/lobby/{lid}/player/{pid}/kit`): the diver fights with
  one of their locker kits; `_with_saved_kits` sends it through the engine as an override (owned / legal / kit rules,
  role kept, the rest of the squad unchanged). Results carry `loadout_id`; `_with_records` gives each saved kit
  its record (drops, kills and deaths per drop, medals).
- Quick swap (`player.kit_edits`, `POST /api/lobby/{lid}/player/{pid}/swap`): on your own card, tap a piece of kit to
  use another item (`to`) or say you don't have it (`not_owned`: that slot alone is refilled). Either also fixes the
  profile's gear. Swaps sit on top of the squad's pinned picks in `_with_saved_kits`; a refilled slot never takes a
  squadmate's stratagem, so nobody else's kit moves. Cleared on a new mission or reroll; "Undo my swaps" in the ⋮ menu.
- Pinning armour (`prefs.armor_set`) is left out of `mind.brief_key`: it swaps that diver's armour only, no rebuild.
- No stratagem twice in a squad (`kitrules.squad_excludes`, and the planner is told); only a diver who owns nothing
  else legal ends up with a double. Democracy Space Station actions that don't act on a mission (`war.DSS_NOT_MISSION`:
  Operational Support, Exosuit Reserves) are dropped from missions and the briefing.
- App nav (`appNav`): fixed at the bottom of every page, the only nav: Home, your current / last table, Profile, War tables,
  War rooms, Roster, Logic (short labels `nav.*` so seven fit at 360 px in every language).
- Debrief uploads (yours, or the whole squad's scoreboard) take 1–4 screenshots of the same mission (`images`), read together.
- Endorse-only oaths (Side Sweep, Sample Run…) can still be ruled out by the scoreboard: each lists `dq` rules in
  `oaths.OATHS` (a field at or under a max, or objectives left undone), checked by `oaths.disqualified` whenever that
  number was read. A DQ beats endorsements. Endorsements are per oath (the button names the oath).
- Fix a misread number (`POST /api/lobby/{lid}/player/{pid}/result/fix`, the diver or the creator): the oaths are judged
  again from the fixed numbers (an endorsed oath stays endorsed unless a DQ now applies); `result.corrected` lists the
  fields fixed by hand and everyone sees them.
- Feedback can carry up to 3 screenshots (`/api/feedback/{id}/images`, downscaled JPEG, EXIF dropped, public like the
  note); the export lists their URLs and `feedback-sync.yml` puts them in the issue.
- Re-uploads (`_same_drop`): the screenshot's mission name (read with the numbers) decides; without names the
  table's mission at upload time does, and identical numbers are always the same scoreboard. Same drop = replaced
  (endorsements too); a different mission is a new drop.
- Career stats (`app/enrich.py`, `server._career`): the latest career read (`locker_stats`, dated) is the baseline; every
  debrief after it adds its numbers on top (kills, deaths, shots, accidentals → friendly kills, samples, stratagems,
  objectives, +1 mission); wins, extractions, time in mission and stratagem types are added at the diver's own career
  rate. A new career read re-grounds: earlier debriefs are marked `counted: "career"` ("in read of {date}") and never
  added twice; later ones `"added"`. Rates, the planner's `derived` / accuracy, the roster and the diver card all use
  these totals (`_snap_of`); the stored `snapshot_json` stays the raw read. Enriched stats (mission types, fronts,
  difficulty, modes, roles, oaths kept / broken, medals) come from every debrief and survive re-grounding; results now
  record `table_faction`, `table_difficulty`, `table_mode` and `role` at upload. Cached per `db.GEN` (bumped on result /
  stat writes).
- Log a drop from the Profile (`POST /api/locker/{lid}/log`, then `/log/{read_id}` with `{i}` when the callsign isn't on the
  scoreboard): 1–4 screenshots plus optional front / mission / difficulty / mode / oaths / saved loadout. Recorded through
  `_record_result` on the profile's log seat (`db.log_seat`: a player row at lobby id `log:<locker>`, no lobby row, hidden
  from `locker_players`), so oaths, medals, the review, the kit record and career totals all apply. Endorse-only oaths
  stay unverified there (nobody to vouch). Log drops only replace an identical scoreboard (`_same_drop(log=True)`).
  Details left blank come off the board (`_log_prefill`): the front from the live war's planet of that name, the
  mission from the board's mission name (`_mission_by_read`, front breaks a shared name's tie). The dialog keeps them in
  an optional fold. New tables and logged drops default to the war room last opened (`store.lastRoom`).
  A logged drop can name one of the diver's war rooms (`result.room_id`, members only): `db.room_results` takes it in, so it
  counts toward standing orders (one drop each, its own difficulty / planet) and goes in the ship's log.
- Operations (`lobby.drop_no` / `drop_at` / `op_done`, `result.drop_no`): a war table runs the planet's operation, 1–3
  missions (`_op_len` by difficulty: D1–2 one, D3–4 two, D5+ three; tables from before operations have `drop_no` NULL and
  stay one mission). Status: open → debriefing → `between` (mission debriefed, more to go) → done (last mission debriefed,
  or the creator's `POST /endop`). `POST /api/lobby/{lid}/next` (creator) keeps planet / front / difficulty / mode / oaths,
  takes a new `mission_id` (`_next_mission` builds it), bumps the mission number (`mission.drop` is in `mind.brief_key`, so every mission gets fresh
  kits), clears quick swaps and Go / No-Go. The table shows only this mission's debriefs; `state.op` has earlier missions
  and the whole-operation oaths (`mission.op_oaths`, judged live on the summed numbers, `_op_sum`). When the operation
  ends, `_finish_op` appends them (`scope: "operation"`, medal seeded `<lid>:op`) to each diver's last debrief, so
  medals / records / rooms count them; their endorsements are keyed `op:<oath>`. Room tallies count each mission a drop.
  Head start: once a table is `between`, `state.op.next` is the suggested next mission (`_next_pick`: first of this front
  and difficulty not played yet) and `_prewarm_next` builds its kits in the background by resolving the table as it will be
  (`_next_lobby`), so the planner's set is pinned under the same `brief_key` /next will use: one plan call per mission,
  inside the caps, once per (table, mission number, pick); `WARMIND_PREWARM=0` turns it off. The Next mission dialog
  defaults to that pick and has one-tap "Same again" / "Random". The Discord table card (`_table_card`) shows mission n
  of m, this mission's debriefs only, each diver's role + main pick, and between missions `NEXT · <mission> · KITS
  READY/BUILDING` with the next kits; page loads use `preview=False` (no engine run for the OG tags).
- Debrief call to action (`debriefCta`): on a table whose mission is played (some debriefs in, or everyone said Go) a diver
  without a debrief gets one big "Upload the squad's scoreboard" on top of the table (hidden on the Debrief tab, which
  has the same `squadUpload`). Go / No-Go is only shown while the table is `open`. The table header shows a Major Order
  only when it's about this mission's front or planet (`moForTable`); Home has the rest.
- First run (`profileSetup`): until a diver has a career read, gear and a PIN, the Profile opens with a 3-step checklist
  (career upload, "Tick my warbonds" → Locker gear tab, "I own everything", PIN). The gear checklist has a warbond quick
  start (`.wbquick`): one tap ticks a warbond's gear; from the "owns everything" state the first tap starts from the base
  game. The gate says gear can wait. A new device's nav Table tab opens the profile's latest open table
  (`/api/locker/{lid}/tables` carries name / folded).
- Tell WARMIND / Tuning (`locker_tune`): on your own debrief a diver writes what worked and what didn't
  (`POST /api/lobby/{lid}/player/{pid}/tune`, or from the Profile `POST /api/locker/{lid}/tune`). One small call
  (`vision.distill_tune`, kind `tune`) turns it into the one note worth keeping (≤25 words, `applies`: all or a faction;
  null when there's nothing for future kits). Notes live in the Profile's Tuning panel (edit / delete,
  `POST /api/locker/{lid}/tune/{id}`), and go to the planner as each diver's `tuning` (every-front + this faction,
  newest first; they outrank debrief lessons). New notes shape kits from the next brief (the next mission of an operation).
- Type to search (`searchable(select, {pic, title})`): a long select becomes a button that opens a search sheet (with gear
  pictures); the real select stays underneath (hidden), so `.value` / "change" code keeps working. Used in the loadout
  builder (every slot), the Profile's armour pin, Log a drop's and Next mission's mission pickers. The gear checklist has a
  search box always on top (`input.gearq`, same filter as the ⚲ dialog; it jumps to the tab with matches).
- Go / No-Go: `player.go`, shown in the war table's command panel.
- Engine rules from feedback (`warmind/resolve.py`): a shield that leaves one hand free (`NEEDS_ONE_HANDED`: Directional
  Shield, Ballistic Shield) forces a one-handed primary (`ONE_HANDED_PRIMARIES`, edit after a patch; kit rule
  `shield_needs_one_handed` tells the planner); boosters useless on a mission type are banned (`BOOSTER_USELESS_ON`:
  Localization Confusion on `objective_defense`); a solo diver's primary must clear chaff; on a bug front a grenade that
  isn't a splash closer makes a hole-closing secondary (`HOLE_SECONDARIES`) worth more. Why-lines naming gear the diver
  isn't carrying are dropped by full name or distinctive word (`mind._clean_why`). Debrief reviews state what the
  numbers show and mark any cause as a guess. Fun mode puts `mind.FUN_PICKS` (One True Flag) on the planner's shortlist.
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
