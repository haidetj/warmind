# Deploying WARMIND

WARMIND is one small web service: a FastAPI app, SQLite for lobby state, and
Anthropic vision calls to read screenshots. It needs exactly one secret — your
`ANTHROPIC_API_KEY` — and a public URL to share with your squad.

## What it costs to run
- **Anthropic API**: one vision call per screenshot uploaded (career intake,
  optional mission prefill, each results review). Reads are small images, so a
  full squad's drop is a handful of calls. You pay Anthropic per call.
- **Hosting**: Render's Starter web service is a few dollars/month and gives you a
  persistent disk (lobbies survive restarts). The Free tier works too, but it
  sleeps after ~15 min idle (first request then cold-starts for ~30s) and has no
  disk, so lobbies reset when it sleeps — fine for a one-off drop, not for
  something you leave up.

## Deploy on Render (blueprint)
1. Put this folder in a GitHub repo (see "Getting the code into a repo" below).
2. Get an Anthropic API key: https://console.anthropic.com → API Keys.
3. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml`.
4. When prompted, set **ANTHROPIC_API_KEY** to your key. (It's marked `sync:false`
   so it never lands in git.)
5. Deploy. Render gives you `https://warmind-xxxx.onrender.com` — that's the link
   you share. The creator opens it, sets the mission, and hands the invite link to
   the squad.

To run **free/ephemeral** instead, delete the `disk:` block and set `plan: free`
in `render.yaml` before deploying.

## Run it locally first (optional)
```bash
pip install -r requirements.txt
cd app
# no key yet -> mock mode, screenshot reads return sample data:
python -m uvicorn server:app --reload --port 8000
# with your key -> real screenshot reading:
ANTHROPIC_API_KEY=sk-ant-... python -m uvicorn server:app --port 8000
```
Open http://localhost:8000 — create a lobby, and open the invite link in a second
browser/incognito window to play both sides.

## Test your key against a real screenshot
```bash
cd app
ANTHROPIC_API_KEY=sk-ant-... python vision_smoke.py /path/to/career_screenshot.png
```
It prints the parsed stats, the validity checks, and the play-style it read.

## Environment variables
| var | default | purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(unset → mock mode)* | enables real screenshot reading |
| `WARMIND_MODEL` | `claude-sonnet-5` | vision model id |
| `WARMIND_DB` | `/data/warmind.db` | SQLite path (mount a disk here to persist) |
| `WARMIND_VISION_MOCK` | *(unset)* | set to `1` to force mock mode even with a key |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | override for a proxy/gateway |

## Getting the code into a repo
Render deploys from a Git repo. Two options:
- **New repo**: create an empty GitHub repo, then from this folder:
  `git init && git add -A && git commit -m "WARMIND" && git remote add origin <url> && git push -u origin main`.
- **Reuse an existing repo**: drop this folder in as `warmind-app/` and set Render's
  **Root Directory** to `warmind-app` so it builds just this service.

## Other hosts
The Dockerfile is standard, so Railway (`railway up`), Fly.io (`fly launch` →
add a volume at `/data`), or any Docker host works. Set `ANTHROPIC_API_KEY` and,
for persistence, mount a volume at `/data`.
