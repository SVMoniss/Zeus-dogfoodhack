---
title: "Build the Platform That Will Judge You: How We Built DOGFOOD 2026"
description: "FastAPI + Next.js + Postgres hackathon platform with backend-enforced judge isolation, z-score calibration, Bradley-Terry/Borda ranks, and one-command Docker. 7/7 acceptance checks PASS."
date: "2026-10-03"
authors: ["Team ZEUS"]
tags: ["hackathon", "fastapi", "nextjs", "postgres", "judging-system", "dogfood2026", "build-in-public"]
canonical: "DOGFOOD 2026 Write-Up Quest submission"
---

# Build the Platform That Will Judge You: How We Built DOGFOOD 2026

> **TL;DR:** We built a self-hostable hackathon submission + judging platform in FastAPI (Python) + Next.js 14 + PostgreSQL 16/pgvector that runs with `docker compose up`. Claimed T1+T2, verified **7/7 PASS** on `run.py`. Hardest wins: backend-enforced judge isolation, z-score calibration + multi-method ranking with ROBUST/FRAGILE verdict, server-side deadline enforcement, and reproducible demo videos (Calibration Cup + Grand Jury).

This post is our **DOGFOOD 2026 Write-Up Quest** entry — a build log about building the platform that judged us.

Submit form: https://tally.so/r/RGEvKl

---

## 1. What is DOGFOOD?

DOGFOOD 2026 prompt in one line:

> Build the platform that will judge you.

Every team builds a submission + judging portal, then gets judged *by an automated acceptance checker* (`run.py` + `.dogfood.toml`) against their own portal.

188 teams submitted. Judging runs through Oct 8. No extensions.

That constraint shaped everything: no demo-ware, no "works on my machine." If `GET /api/judge/scores?judge=<peer>` as another judge doesn't 403, you fail. If closed events accept submissions, you fail. If CSV export breaks, you fail.

We are **Team ZEUS**. Our stack:

- **Backend:** FastAPI, async SQLAlchemy 2.0, Python 3.11+, Pydantic, Alembic
- **Frontend:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- **DB:** PostgreSQL 16 + pgvector
- **Auth:** JWT in httpOnly cookies (`SameSite=Lax`), `require_role(*allowlist)` deny-by-default
- **Ship:** Docker Compose, one command, offline-capable, auto-seed

```
┌──────────────────────────────────────────────────────────────┐
│ Docker Compose                                               │
│  Postgres :5432  +  FastAPI :8000  +  Next.js :3000           │
└──────────────────────────────────────────────────────────────┘
```

Run it:

```bash
docker compose up
python3 run.py .dogfood.toml > acceptance-report.txt
```

Our report (`acceptance-report.txt`):

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

## 2. What we actually shipped

### T1 — Core Platform

- JWT auth with roles: `visitor < participant < judge < organizer < admin`
- Events with `submissions_open_at / submissions_close_at`, tracks, prizes (JSONB)
- Teams via invite codes, join/leave, member management
- Projects: draft → submitted, editable until deadline, **server-side deadline check**
- Public gallery: search, filter by track, pagination, no auth required

Deadline logic lives in `check_submission_open()` on create/update/submit/delete. Naive/aware datetimes normalized. Client clocks irrelevant — server time is authoritative. E2E covered.

### T2 — Judging System (the hard part)

- Judge invite + track-based assignment (`JudgeAssignment`, unique `(judge_id, track_id)`)
- Weighted rubric, frozen at exactly 100% before judging (`events.rubric_frozen`)
- **Backend-enforced isolation:** judges can ONLY see own scores
- Self-review block + declared conflicts (`/conflicts`) block scoring per project
- Progress dashboard: per-track + per-judge loads
- Cross-judge normalization (z-score), multi-method ranks, audit trail, CSV export

### T3 — Public Voting

- Email-gated ballot tokens (`POST /api/events/{id}/voting/token`, 5/hour per email)
- Deterministic per-token shuffle — fair order, stable reloads
- Hidden results during voting (organizers always see; public only after `results_published_at`)
- Comments with organizer approve queue
- Anti-abuse: per-IP rate limits, unique `(event, project, voter_email)`, full `vote_audit_log`

### T4 — Stretch / Integrations

- REST API `/api/v1/...` with `X-API-Key` (SHA-256 hashed, prefix display, expiry, revocation) + OpenAPI at `/docs`
- Webhooks with HMAC-SHA256, 3 attempts with backoff in BackgroundTasks
- Verifiable certificates (Ed25519, checkable at `/certificates/verify`)
- Embeddable gallery widget (`/api/events/{slug}/widget.js`)
- Bulk JSON import/export with per-record error log + job tracking
- pgvector `project_embeddings` table ready for semantic search

Full schema in `DATA-MODEL.md`, judging math in `JUDGING.md`, threats in `THREAT-MODEL.md`.

## 3. Hardest problem #1: Judge isolation

This is the #1 checker failure point across teams. We did it in the backend, never just frontend:

```python
@router.get("/judge/scores")
async def get_judge_scores(
    judge_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.JUDGE:
        if judge_id and judge_id != current_user.id:
            raise HTTPException(403, "Cannot view other judge's scores")
        target_judge_id = current_user.id
    elif current_user.role in [UserRole.ORGANIZER, UserRole.ADMIN]:
        if not judge_id:
            raise HTTPException(400, "judge_id required for organizer")
        target_judge_id = judge_id
    else:
        raise HTTPException(403, "Insufficient permissions")
```

Verified live matrix (`ARCHITECTURE.md`):

| Role | Endpoint | Result |
|---|---|---|
| Visitor | `GET /api/events/{slug}/projects` | 200 |
| Participant (closed event) | `POST .../projects` | 400 |
| Participant | `GET /api/judge/scores`, `GET …/export.csv` | 403 |
| Judge A | `GET /api/judge/scores` (own) | 200 |
| Judge B | `GET /api/judge/scores?judge=<peer>` | 403 |
| Organizer | `GET …/export.csv` | 200 CSV |
| No session | protected routes | 401 |

Plus Playwright `judge-isolation` spec + `run.py` proof. No known residual risk here.

## 4. Hardest problem #2: Fair ranking is not an average

Raw averages reward luck-of-the-draw: lenient judges inflate their projects, harsh judges sink theirs.

We implemented per-judge, per-criteria z-score calibration:

```
z = (s - μ_judge) / σ_judge        (if σ > 0 else raw)
normalized = z * σ_global + μ_global
Project_Normalized_Total = Σ(weight_i * Normalized_Score_i) / 100
```

Edge cases handled explicitly: single-score judges (σ=0 → raw), constant scorers (flagged `constant: true`, excludable via `/ranking?exclude_judge=`), incomplete batches (`low_confidence`), duplicate projects (flagged in `duplicates`, counted once via `kept_project_id`).

Then we added two more views over the same scores (`GET /api/events/{id}/ranking`, organizer-only):

- **Bradley-Terry:** MM-estimated latent strengths from per-judge pairwise comparisons (ties skipped, disconnected-graph warning)
- **Borda:** per-judge ranking points with fractional points for ties

Prize boundary (top-k, default k=3) is **ROBUST** only if every method agrees on the set above the line, else **FRAGILE** with disagreeing methods named.

This actually caught real flips in our seeded demos:

- **Calibration Cup (4 judges × 30 projects, seed 20260928):** raw #2 "Food Rescue Route" falls to calibrated #5 → FRAGILE. Judge D constant-3.0, projects #7/#19 with 2 reviews, duplicate "Solar Kiosk".
- **Grand Jury (30 judges × 40 projects, 118 rows, seed 20260929):** raw #2 "Mural Mile" → calibrated #3 → FRAGILE.

Both scenarios write their plan to `audit_events` as `assignment.generate` with seed + rule + loads, so anyone can reproduce:

```bash
python demo-5min/seed_judging_demo.py
python demo-5min/seed_grand_jury.py
```

## 5. Audit everything, freeze the rubric

Every scoring mutation appends `audit_events` rows (actor, action, entity, details). Rubric edits lock once weights total exactly 100 (`rubric.freeze`). Assignment generation, score submits, conflict declarations — all in the trail, visible in the demo at 2:09.

Honest gap we disclose on screen and in `THREAT-MODEL.md`: audit log has no hash chain. Accepted risk, stated in terminal proof.

Other explicit tradeoffs:

- No per-request CSRF tokens (JSON APIs + `Lax` cookies — accepted)
- In-memory rate-limit window (needs shared store for multi-worker — documented in code)
- Email is cheap, so Sybil voting needs organizer review of `vote_audit_log`
- Malicious webhook URLs are an operator-trust boundary (organizer-only CRUD)

We'd rather state residuals than pretend they don't exist.

## 6. Demos that rebuild in one command

We didn't screen-record clicks. We built a generator:

`node demo-5min/make.mjs` → narrates (offline TTS), records browser tour paced to voice (beat timestamps in `demo-5min/beats.json`), muxes cuts, seeds dataset fresh.

Outputs in repo root:

- `e2e-demo-5min.mp4` (3:56) — landing → Calibration Cup tour → gallery duplicate → live participant submit ("Juror's Jukebox") → audit trail → progress (23/22/21/23) → live judge scoring → CSV → terminal proofs (`compose ps`, 403s, FRAGILE, CSV diff, `run.py` 7/7 PASS)
- `e2e-demo-grand-jury.mp4` (3:05) — same story at 30×40 fixture scale
- `e2e-arch-1min.mp4` (1:00) — containers, stack, REST + screenshots, Thanks/Team ZEUS
- Narrated twins `*-narrated.mp4` (Microsoft Zira voice, script in `demo-5min/narration/`)

Rebuild Grand Jury variant with env vars, e.g.:

```bash
SCENARIO=grand-jury DEMO_PREFIX=grand-jury- EVENT_TITLE='Grand Jury' \
LIVE_EMAIL=dilan.yilmaz@example.org LIVE_PW=judgepass123 \
OUT_PREFIX=e2e-demo-grand-jury node demo-5min/make.mjs
```

## 7. Lessons for next time

1. **Checker-first development works.** We wrote `.dogfood.toml` routes early and ran `run.py` after every auth change. It caught two isolation regressions before they shipped.
2. **Seed awkwardness on purpose.** Constant scorers, unfinished batches, duplicates — if your ranking UI never sees them in dev, it will lie in prod. Our FRAGILE verdict only means something because the fixtures are adversarial.
3. **Math needs UI.** Z-scores mean nothing to organizers without the progress dashboard + CSV raw-vs-calibrated columns + `?exclude_judge=` toggle. We built all three.
4. **One-command repro beats docs.** `docker compose up` → seed prints session cookies → paste into `.dogfood.toml` → `run.py`. New contributors and judges use the same path.
5. **Disclose gaps.** Hash-chain-less audit, no CSRF tokens, single-process rate limits — writing them in THREAT-MODEL.md made judging Q&A easier, not harder.

## 8. Try it / links

- Repo: this repo (`docker compose up` → http://localhost:8000 backend, http://localhost:3000 frontend)
- Test users: `organizer@ / judge_a@ / judge_b@ / participant@dogfood.local` / `testpass123`
- Checker: `python3 run.py .dogfood.toml`
- Docs: `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `THREAT-MODEL.md`
- Videos: `e2e-demo-5min.mp4`, `e2e-demo-grand-jury.mp4`, `e2e-arch-1min.mp4` (+ narrated twins)
- Deploys: `render.yaml` (Blueprint), `demo-railway` branch (Railway hardening: PORT-aware CMD, Secure/None cookies, healthchecks)

Public deploy quick path (Render): push → New > Blueprint → put backend URL in frontend `NEXT_PUBLIC_API_URL` buildArg → play. Redeploy resets (fixtures reseed every boot).

---

Built for DOGFOOD 2026 by Team ZEUS. MIT licensed. Fork it for your hackathon — *this platform is designed to be forked and self-hosted by Hackathon Raptors for their events.*

If you ran your own event on it, tell us where the ranking flipped on you. We love a good FRAGILE.
