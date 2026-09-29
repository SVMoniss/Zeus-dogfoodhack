# DOGFOOD 2026 - Hackathon Platform

> **Build the platform that will judge you.**

A submission and judging platform for hackathons, built for the DOGFOOD 2026 hackathon.

## Features

### T1 - Core Platform ✅
- **Authentication**: JWT-based with httpOnly cookies, roles (visitor, participant, judge, organizer, admin)
- **Event Management**: Create events with configurable dates, tracks, and prizes
- **Team Formation**: Invite codes, join/leave teams, member management
- **Project Submission**: Draft mode, edit until deadline, deadline enforcement
- **Public Gallery**: Search, filter by track, pagination, no auth required

### T2 - Judging System ✅
- **Judge Invitation & Assignment**: Email invites, track-based assignments (dashboard UI included)
- **Weighted Scoring Rubric**: Configurable criteria, frozen at exactly 100% before judging
- **Backend-Enforced Isolation**: Judges can ONLY see their own scores (critical checker requirement)
- **Self-review & Conflict Exclusion**: Judges cannot score their own team or conflicted projects
- **Progress Dashboard**: Real-time organizer view of judging progress
- **Cross-Judge Normalization**: Z-score normalization per judge (documented in JUDGING.md)
- **Multi-method Ranks**: Raw, calibrated, Bradley-Terry, Borda + ROBUST/FRAGILE boundary verdict
- **Team Receipts**: Per-team averages, anonymized feedback, ranks per method
- **Mutation Audit Trail**: Every sensitive change logged for organizers
- **CSV Export**: Results (raw + normalized + ranks), assignments, reviews, audit

### T3 - Public Voting ✅
- **Email-gated voting tokens** (`POST /api/events/{id}/voting/token`, 5/hour per email)
- **Randomized ballot ordering** (deterministic per-token shuffle — fair order, stable reloads)
- **Hidden results during voting** (organizers always see; public only after `results_published_at`)
- **Project comments** with moderation queue (organizer approve flow)
- **Anti-abuse**: per-IP vote rate limits, duplicate detection via unique constraint, full `vote_audit_log` trail readable by organizers

### T4 - Stretch Features ✅
- **REST API with OpenAPI docs** (`/api/v1/...` keyed by `X-API-Key`, interactive docs at `/docs`)
- **API keys** with hashed storage, prefix display, expiry and revocation
- **Webhooks** with HMAC-SHA256 signatures, 3 delivery attempts, fired on submit/score events
- **Verifiable certificates** (Ed25519-signed, publicly checkable at `/certificates/verify`)
- **Embeddable gallery widget** (`/api/events/{slug}/widget.js`)
- **Bulk import/export** (full JSON dump + import with per-record error log and job tracking)
- Semantic search (pgvector) (Planned)

## Tech Stack

- **Backend**: FastAPI (Python 3.11+), async SQLAlchemy 2.0, PostgreSQL 16 with pgvector
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Auth**: JWT with httpOnly cookies (checker-compatible)
- **Containerization**: Docker Compose (offline-capable, single command)

## Quick Start

### Prerequisites
- Docker Desktop
- Docker Compose v2

### One Command Startup

```bash
docker compose up
```

This will:
1. Start PostgreSQL with pgvector extension
2. Run database migrations
3. Seed fixtures.json (40 projects, 30 judges, 8 tracks)
4. Create test users with known session cookies
5. Start FastAPI backend on http://localhost:8000
6. Start Next.js frontend on http://localhost:3000

### Test Accounts (for checker)

After startup, the seed script prints session cookies:

```
organizer:    Cookie: session=<token>
judge_a:      Cookie: session=<token>
judge_b:      Cookie: session=<token>
participant:  Cookie: session=<token>
```

Copy these into `.dogfood.toml` and run the acceptance checker:

```bash
python3 run.py .dogfood.toml > acceptance-report.txt
```

## Demo video (3:56)

`e2e-demo-5min.mp4` — one combined cut: landing page, full role lifecycle
(participant submits, judge scores, organizer publishes), judge calibration,
then T1/T2 validation in the terminal. The lifecycle runs on the Calibration
Cup demo event: 4 judges × 30 projects, project *i* skips judge *(i mod 4)* (seed `20260928`,
plan in the audit trail as `assignment.generate`). One track ("General"), one
criterion ("Overall", weight 100) — track matching is relaxed for the demo and
stated on screen. Awkward cases seeded on purpose: judge D scores a constant 3
(flagged, excludable via `/ranking?exclude_judge=`), projects #7/#19 ship with
2 reviews (`low_confidence`), and a second "Solar Kiosk" is flagged in
`duplicates` and counted once. Observed result: boundary verdict FRAGILE —
raw #2 "Food Rescue Route" falls to calibrated #5.
One command rebuilds it end to end — `node demo-5min/make.mjs` narrates (offline
TTS), records the browser tour paced to the voice (beat timestamps in
`demo-5min/beats.json`), then muxes both cuts (dataset: `python
demo-5min/seed_judging_demo.py`). Terminal proofs type out verbatim
`curl`/`run.py`/CSV outputs. Claimed tiers only (T1, T2).
`e2e-demo-5min-narrated.mp4` is the same cut with the voice mixed in
(offline TTS, Microsoft Zira lady voice; script: `demo-5min/narrate.ps1`,
lines: `demo-5min/narration/`).

| Time | Segment |
|---|---|
| 0:09 | Landing page: countdown, tracks, four role doors (gallery, judging, organizer, vote) |
| 0:48 | Calibration Cup tour: scenario note, timeline, single track, 30 projects |
| 1:03 | Gallery: duplicate "Solar Kiosk" ×2 side by side |
| 1:31 | Participant drafts and submits "Juror's Jukebox" live |
| 2:09 | Audit trail: `assignment.generate` with seed 20260928 |
| 2:19 | Progress dashboard: loads 23/22/21/23 by judge |
| 2:40 | Judge A completes Harbor Cleanup live ("Scores saved.") |
| 3:11 | CSV export download, gallery finale |
| 3:23 | Terminal: `compose ps`, scenario, judge_b → 403, participant → 403, FRAGILE calibration, CSV raw-vs-calibrated rows, `run.py` 7/7 PASS, known gap (audit log has no hash chain — accepted, see THREAT-MODEL.md) |

## Demo video: Grand Jury (3:05)

`e2e-demo-grand-jury.mp4` — same story at fixture scale: 30 judges × 40 projects,
3 reviews each (118 score rows, seed `20260929`, dataset: `python
demo-5min/seed_grand_jury.py`). Triples cycle so every judge reviews exactly 4
projects; awkward cases identical in kind (constant scorer, 2 unfinished
batches, duplicate Solar Kiosk). Observed: FRAGILE, raw #2 "Mural Mile" →
calibrated #3. Rebuilt with scenario env vars, e.g.
`SCENARIO=grand-jury DEMO_PREFIX=grand-jury- EVENT_TITLE='Grand Jury'
LIVE_EMAIL=dilan.yilmaz@example.org LIVE_PW=judgepass123 LIVE_TITLE='Repair Cafe'
NEW_TITLE='Encore Alley' NEW_ASSERT=Encore TERMINAL_HTML=terminal3.html
OUT_PREFIX=e2e-demo-grand-jury node demo-5min/make.mjs` (narrated twin:
`e2e-demo-grand-jury-narrated.mp4`, Zira voice).

## Project Structure

```
dogfoodhack/
├── .dogfood.toml               # Checker configuration
├── acceptance-report.txt       # Output of run.py
├── docker-compose.yml          # One-command startup
├── README.md                   # This file
├── ARCHITECTURE.md             # System design
├── DATA-MODEL.md               # Schema documentation
├── JUDGING.md                  # Judging system docs
├── LICENSE                     # MIT License
├── src/                        # All code written during the window
│   ├── backend/
│   │   ├── Dockerfile              # Backend container
│   │   ├── Dockerfile.seed         # Seed service container
│   │   ├── pyproject.toml          # Python dependencies
│   │   ├── seed.py                 # Fixture loader
│   │   ├── alembic/versions/       # DB migrations
│   │   └── app/
│   │       ├── main.py             # FastAPI entry point
│   │       ├── core/               # Config, security, database
│   │       ├── models/             # SQLAlchemy models
│   │       ├── schemas/            # Pydantic schemas
│   │       ├── api/                # auth/events/teams/projects/judging/voting/t4
│   │       └── services/           # Webhook delivery, certificate signing
│   └── frontend/
│       ├── Dockerfile              # Frontend container
│       ├── package.json            # Node dependencies
│       ├── next.config.js          # Next.js config
│       ├── tailwind.config.js      # Tailwind config
│       └── src/
│           ├── app/                # gallery/vote/project detail/judge/
│           │                       # organizer dashboard/export/integrations,
│           │                       # certificates verify
│           ├── lib/                # Utilities (auth, api)
│           └── types/              # TypeScript types
└── tests/                      # Own test suite, beyond the acceptance one
    └── e2e/                    # Playwright specs: auth/gallery/submission/
                                # judge/csv/demo-lifecycle/t3-voting/t4-integrations
```

## Development

### Backend
```bash
cd src/backend
uv sync
uv run uvicorn app.main:app --reload
```

### Frontend
```bash
cd src/frontend
npm install
npm run dev
```

### Run Tests
```bash
# Backend tests
docker compose exec backend pytest -v

# Frontend tests
docker compose exec frontend npm run test

# E2E tests
docker compose exec frontend npx playwright test
```

## Acceptance Checker

The DOGFOOD 2026 spec includes an automated acceptance checker (`run.py`) that verifies:

### T1 Checks
- ✅ Gallery is public (GET /projects → 200)
- ✅ Gallery shows fixture projects
- ✅ Closed event refuses submissions (POST after deadline → 4xx)

### T2 Checks
- ✅ Judge sees own scores (GET /api/judge/scores as judge_a → 200)
- ✅ **Judge cannot see peer scores** (GET /api/judge/scores?judge=judge_a as judge_b → 401/403)
- ✅ Participant blocked from judge endpoints (GET /api/judge/scores as participant → 401/403)
- ✅ CSV export works (GET /api/export.csv as organizer → 200 + CSV)

Run the checker:
```bash
python3 run.py .dogfood.toml > acceptance-report.txt
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and rationale
- [DATA-MODEL.md](DATA-MODEL.md) - Database schema and migrations
- [JUDGING.md](JUDGING.md) - Judging algorithms, normalization, audit trail
- [THREAT-MODEL.md](THREAT-MODEL.md) - Threats, mitigations, accepted risks

## License

MIT License - see [LICENSE](LICENSE) for details.

## Team

Built for DOGFOOD 2026 Hackathon by [ZEUS].

---

*This platform is designed to be forked and self-hosted by Hackathon Raptors for their events.*
