---
title: "Setup Guide (main branch): Run DOGFOOD 2026 Locally in One Command"
description: "Clone, docker compose up, seed fixtures, test accounts, run.py checker, and local dev for FastAPI + Next.js + Postgres/pgvector — based on origin/main."
date: "2026-10-03"
authors: ["Team ZEUS"]
tags: ["dogfood2026", "setup", "docker-compose", "fastapi", "nextjs", "postgres", "pgvector"]
branch: "origin/main"
---

# Setup Guide (main branch): Run DOGFOOD 2026 Locally in One Command

This guide is pinned to **`origin/main`** — not `demo-railway`, not `master`.
If you just want to run the project, you only need the steps in §1–§4.

> One-liner: `docker compose up`, then open http://localhost:3000 (frontend) and http://localhost:8000/docs (backend).

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs
- Health: http://localhost:8000/health, `/health/ready`, `/health/live`, `/health/version`

---

## 1. Prerequisites

- **Docker Desktop** (with **Docker Compose v2**)
- **Git**
- **Python 3.11+** — only needed for `run.py` (stdlib only, nothing to install)
- Ports free: **5432** (postgres), **8000** (backend), **3000** (frontend)

Check:

```bash
docker --version
docker compose version
python3 --version
```

No other toolchains required for the happy path. `uv`, `npm`, Node 20, Python 3.11 all run *inside* containers.

---

## 2. Clone (main branch) and boot

```bash
git clone https://github.com/SVMoniss/Zeus-dogfoodhack.git dogfoodhack
cd dogfoodhack
git checkout main
docker compose up
```

First boot takes a few minutes (builds `backend` on `python:3.11-slim` + `frontend` on `node:20-alpine`). Subsequent boots are fast.

What `docker compose up` does on `main` (`docker-compose.yml`):

1. **`postgres`** — `pgvector/pgvector:pg16`, db/user/pass `dogfood/dogfood`, mounts `./init.sql` (enables `vector` + `uuid-ossp`), healthcheck `pg_isready -U dogfood`, port `5432:5432`.
2. **`backend`** — builds `./src/backend/Dockerfile`, mounts `./src/backend:/app`, runs:
   ```bash
   uv run python seed.py && uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   Env: `DATABASE_URL=postgresql+asyncpg://dogfood:dogfood@postgres:5432/dogfood`, `FRONTEND_URL=http://localhost:3000`, `SECRET_KEY=${SECRET_KEY:-dev-secret-change-in-production}`, port `8000:8000`.
3. **`frontend`** — builds `./src/frontend/Dockerfile`, mounts `./src/frontend:/app`, runs `npm run dev -- -H 0.0.0.0 -p 3000`, port `3000:3000`. Env: `NEXT_PUBLIC_API_URL=http://localhost:8000`, `WATCHPACK_POLLING=true` (required on Windows bind mounts, otherwise Next serves stale pages).
4. **`seed` (profile-only)** — not started by default (`profiles: [seed]`). Normal path seeds via the backend `seed.py` step above.

Expected log milestones:

- `postgres … database system is ready to accept connections`
- backend `seed.py` finishes (fixtures + test users)
- `alembic upgrade head` completes
- `Uvicorn running on http://0.0.0.0:8000`
- frontend `✓ Ready in …` on `:3000`

Sanity check in a second terminal:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
curl http://localhost:3000 -I
```

`health/ready` actually opens a DB connection (`SELECT 1`) — if it returns `{"status":"ready"}`, postgres + migrations + networking are good.

---

## 3. Seed data + test accounts

Boot auto-loads `fixtures.json` via `src/backend/seed.py`:

- 1 event (`Sample Hack 2026`, `submissions_close` in the past — intentional for checker T1 “closed event refuses submissions”)
- 8 tracks, 30 judges, 40 teams, ~40 projects, ~200 scores

It also creates 4 fixed checker users with IDs/tokens that **must match `.dogfood.toml`**:

| Role | Email | Use |
|---|---|---|
| organizer | `organizer@dogfood.local` | CSV export, progress, ranking |
| judge_a | `judge_a@dogfood.local` | own scores 200 |
| judge_b | `judge_b@dogfood.local` | peer read must 403 |
| participant | `participant@dogfood.local` | judge endpoints must 403 |

Password for manual login: `testpass123`.

The seed script prints session cookies on boot, e.g.:

```
organizer:    Cookie: session=<token>
judge_a:      Cookie: session=<token>
...
```

On `main` those tokens are already committed in `.dogfood.toml` (`FIXED_TOKENS` in `seed.py`), so you can run the checker immediately without copying anything — just don’t change `SECRET_KEY` before running the checker, or the committed cookies stop verifying. For real deploys, set a strong `SECRET_KEY`.

Reset the DB:

```bash
docker compose down -v
docker compose up
```

`-v` drops `postgres_data` so `init.sql` + seed re-run cleanly.

---

## 4. Verify with the acceptance checker (7/7 PASS)

`run.py` on `main` is stdlib-only. No install.

```bash
python3 run.py .dogfood.toml > acceptance-report.txt
cat acceptance-report.txt
```

Config (`.dogfood.toml` on `main`):

```toml
[portal]
base_url = "http://localhost:8000"

[tiers]
claimed = ["T1", "T2"]

[routes]
gallery      = "/api/events/sample-hack-2026/projects"
submit       = "/api/events/sample-hack-2026/projects"
judge_scores = "/api/judge/scores"
peer_scores  = "/api/judge/scores?judge=judge_a@dogfood.local"
csv_export   = "/api/events/sample-hack-2026/export.csv"
```

Expected (`acceptance-report.txt`):

```
T1  gallery is public ................. PASS
T1  project from fixtures shown ....... PASS
T1  closed event refuses submissions .. PASS
T2  judge sees own scores ............. PASS
T2  judge cannot see peer scores ...... PASS
T2  participant blocked ............... PASS
T2  csv export works .................. PASS
claimed T1 T2, verified T1 T2
```

Manual equivalents (copy a cookie from `.dogfood.toml`):

```bash
BASE=http://localhost:8000
SLUG=sample-hack-2026
# public gallery — no auth
curl $BASE/api/events/$SLUG/projects | head -c 300
# judge_a own scores — 200
curl -H "Cookie: session=<judge_a token>" $BASE/api/judge/scores -i
# judge_b peeking at judge_a — must be 401/403
curl -H "Cookie: session=<judge_b token>" "$BASE/api/judge/scores?judge=judge_a@dogfood.local" -i
# CSV as organizer — 200 + text/csv
curl -H "Cookie: session=<organizer token>" $BASE/api/events/$SLUG/export.csv -i | head
```

---

## 5. What’s running where (main-branch map)

Root on `origin/main` (`git ls-tree --name-only origin/main`):

```
.dogfood.toml  run.py  fixtures.json  init.sql
docker-compose.yml  playwright.config.ts
ARCHITECTURE.md  DATA-MODEL.md  JUDGING.md  THREAT-MODEL.md
src/backend  src/frontend  tests  package.json
```

Key files:

- `src/backend/Dockerfile` — `python:3.11-slim` + `gcc libpq-dev python3-dev`, `pip install uv && uv sync`, `COPY . .`
- `src/backend/pyproject.toml` — `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `psycopg2-binary`, `alembic`, `pgvector`, `pydantic v2`, `python-jose`, `passlib[bcrypt]` (pinned `bcrypt==4.0.1`)
- `src/backend/app/main.py` — routers `auth, events, teams, projects, judging, voting, t4, audit`, CORS allow-origin = `FRONTEND_URL`, health endpoints above
- `src/frontend/Dockerfile` — `node:20-alpine`, `npm install`, `npm run build`
- `src/frontend/package.json` — `next 14.2.0`, `react 18.3`, `axios`, `zustand`, `vitest`
- `playwright.config.ts` — `testDir: ./tests/e2e`, `baseURL: http://localhost:3000`, `webServer: docker compose up -d`
- `init.sql` — `CREATE EXTENSION vector; CREATE EXTENSION "uuid-ossp";`

There is **no** `render.yaml` / root `Dockerfile` / `railway.json` on `main` — those live on `demo-railway`. Don’t copy deploy instructions from that branch if you’re following this guide.

---

## 6. Local dev without Docker (optional)

Use this when iterating on one service; keep postgres in Docker.

```bash
# postgres only
docker compose up postgres
```

Backend (`src/backend`):

```bash
cd src/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Set `DATABASE_URL=postgresql+asyncpg://dogfood:dogfood@localhost:5432/dogfood` and `SECRET_KEY=dev-secret-change-in-production` in your shell if not using compose env.

Frontend (`src/frontend`):

```bash
cd src/frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000`.

Tests:

```bash
# backend (inside compose)
docker compose exec backend pytest -v
# frontend unit
docker compose exec frontend npm run test:run
# e2e (Playwright, boots compose itself)
npx playwright test
```

---

## 7. Troubleshooting (the 5 issues everyone hits)

1. **Ports in use (5432/8000/3000).** Stop local postgres/Node, or `docker compose down` then `up`. Check with `Get-NetTCPConnection -LocalPort 5432,8000,3000` (PowerShell) / `lsof -i :5432,:8000,:3000`.
2. **Changed `SECRET_KEY` → checker 401s.** Committed `.dogfood.toml` cookies are HMAC’d with the dev secret. Run the checker with the default first, then rotate the secret for real use.
3. **Frontend shows stale pages on Windows.** That’s why `WATCHPACK_POLLING=true` is set in compose. Don’t remove it on bind mounts.
4. **`vector` extension missing.** Only happens if you point at an external postgres instead of the compose `pgvector/pg16` image. Use the compose DB or install `pgvector` + run `init.sql` once.
5. **CORS / empty pages.** Backend allows exactly `FRONTEND_URL` (default `http://localhost:3000`). If you open the frontend on another host/port, set `FRONTEND_URL` to match and recreate the backend container. API base for the browser is baked as `NEXT_PUBLIC_API_URL` — rebuild/restart frontend after changing it.

Fresh-start nuke (wipes DB volume + rebuilds):

```bash
docker compose down -v
docker compose up --build
```

---

## 8. Try the core flows after boot

- Gallery (public): http://localhost:3000 — search, track filter, pagination, no login.
- Login as participant (`participant@dogfood.local` / `testpass123`) — drafts, submit before deadline, blocked after close (server returns 4xx — that’s the T1 check).
- Login as `judge_a@dogfood.local` — score assigned tracks; try opening another judge’s scores → 403 (T2 isolation).
- Login as organizer — judging progress, `GET /api/events/{id}/ranking` (raw vs calibrated vs Bradley-Terry vs Borda, ROBUST/FRAGILE), `export.csv` download.
- Public voting + comments (T3) and API keys/webhooks/certificates/widget/bulk (T4) are in `/docs` — see `ARCHITECTURE.md`, `JUDGING.md`, `DATA-MODEL.md` for route details.

Docs to read next: `README.md` (features), `ARCHITECTURE.md` (service boundaries + auth matrix), `DATA-MODEL.md` (schema), `JUDGING.md` (z-score math), `THREAT-MODEL.md` (accepted risks: no audit hash-chain, no CSRF tokens, single-process rate limits).

---

*Pinned to `origin/main` (commit `e2c7900` at time of writing). If `main` moved, re-check `docker-compose.yml`, `.dogfood.toml`, and `src/backend/app/main.py` — those three are the source of truth for ports, routes, and health.*
