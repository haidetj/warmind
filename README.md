# WARMIND — hosted squad lobby

A Helldivers 2 squad coach you can share by link. The creator makes a lobby and
sets the mission; friends open the link, upload a screenshot of their in-game
Career screen, and each gets a loadout **with a reason**. The lobby shows everyone
live. After a drop, upload the end-of-mission scoreboard for an after-action review.

The coach grows players by exposing tactics they don't currently use while playing
to what they're already good at — **it does not handicap them**. Three modes:
**Fun** (new tools), **Challenge** (out of your comfort zone), **Improve**
(strengths, one stretch). They are one scoring function with a different objective
term.

## How it works
- **Read a screenshot → play-style.** A vision model reads career stats into
  numbers; a deterministic classifier names the play-style (Siege Anchor, Danger
  Close, Fire for Effect, Forward Eye, By the Book). The player can override it.
- **Resolve the squad.** The mission's planet hazards + situation + tactical
  overlay compose into one kit-tag *pressure* vector; each item is scored by
  `base_grade + pressure·tags + mode_term`. Roles are selected from the pressure
  and assigned by mode; the baseline-capability rule guarantees every diver answers
  heavy armour, structures, chaff and break-contact, or the brief names who covers
  the gap. This is the same resolver in `app/warmind/`, with golden tests.
- **After-action.** The results scoreboard is read, then the model grades the
  *advice* against the player's career baseline and role — never the player.

## Architecture
```
app/
  server.py        FastAPI: lobby lifecycle, live resolution, vision endpoints
  db.py            SQLite persistence (lobbies, players, snapshots, results)
  vision.py        Anthropic vision calls (career / mission prefill / AAR) + mock mode
  warmind/         the resolver package (pressure, scoring, coverage, roles, resolve)
    stats.py       career metrics + play-style classifier
    data/          missions, tactical objectives, modifier bridge, hazards, items
  static/          index.html + app.js — the lobby SPA
  vision_smoke.py  test your key against a real screenshot
Dockerfile, render.yaml, DEPLOY.md, requirements.txt
```

## Run / deploy
See **DEPLOY.md**. TL;DR: set `ANTHROPIC_API_KEY`, deploy the Dockerfile to Render
(blueprint included), share the URL. Without a key it runs in **mock mode** so you
can click through the whole flow with sample data.

## Honest status
- **Tested:** the resolver (9 golden tests + a browser-driven multiplayer run),
  the play-style classifier (reproduces four real career reads), the full lobby
  flow end to end.
- **Needs your key to exercise live:** the three vision calls. Their request shape
  is the standard Anthropic Messages vision format; `vision_smoke.py` verifies your
  key against a real screenshot in one command.
- **Provisional:** item meta-grades in `warmind/data/items.yaml` are editorial
  (there is no public HD2 pick-rate data) and kept small so the mission decides the
  kit. The screenshot prompts read what's on screen; unusual stat layouts may need
  a prompt tweak — start with `vision_smoke.py` on a real screenshot.
