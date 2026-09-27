# Threat Model

Scope: the self-hosted DOGFOOD 2026 portal (`docker compose up`, single
operator). Out of scope: host OS hardening, TLS termination, and backups
(operator responsibilities).

## Assets

- Judge scores and identities (must stay isolated per judge)
- Participant submissions (drafts must not leak before deadline/results)
- Organizer credentials and API keys (full event control)
- Result integrity (rankings must reflect submitted scores only)

## Threats and mitigations

| Threat | Mitigation (implemented) | Residual risk |
|---|---|---|
| Login brute force / credential stuffing | 100/min per (IP, email) → 429 (`POST /api/auth/login`); bcrypt hashing (~100ms/verify bounds throughput); in-memory window | Single-process store: a multi-worker deploy needs a shared store (documented in code) |
| Judge peer-score snooping | Backend isolation: `GET /api/judge/scores` 403s cross-judge reads; e2e `judge-isolation` + `run.py` prove it | None known |
| Self-review (judge scores own team) | `POST /api/judge/scores/{id}` 403s team members; e2e covered | Organizer must still assign sensibly; conflicts UI exists for the rest |
| Judge collusion via shared tracks | Declared conflicts (`/conflicts`) block scoring per project; audit trail records declarations | Collusion outside the platform is undetectable (stated, not solved) |
| Sybil / ballot stuffing (T3) | Email-gated tokens (5/hour), per-IP vote rate limit, one-vote uniqueness, `vote_audit_log` | Email is cheap; determined Sybils need organizer review of the audit log |
| Duplicate votes | Unique `(event, project, voter)` + `DUPLICATE_DETECTED` audit; e2e covered | None known |
| Deadline gaming | Server-side `check_submission_open` on create/update/submit/delete; naive/aware datetime normalized; e2e covered | Client clocks irrelevant (server time authoritative) |
| Score tampering post-hoc | All scoring mutations append `audit_events` rows (actor, action, entity); rubric freeze blocks criteria edits once weights total 100 | Audit log itself is organizer-visible, not tamper-proof (no hash chain — accepted) |
| Results leak during voting | Results endpoints 403 for non-organizers until `results_published_at`; e2e covered | Organizer OPSEC (screenshots) out of scope |
| CSRF on cookie auth | `SameSite=Lax` httpOnly cookies; state-changing API is JSON (`Content-Type: application/json`, no simple-request CSRF) | No per-request CSRF tokens (accepted: JSON APIs + Lax) |
| API key theft | SHA-256 hash stored, secret shown once, prefix display, expiry, revocation, event scoping, permission check; e2e covered | Bearer-style: theft equals access until revoked (documented) |
| Webhook abuse (SSRF/retry storms) | Organizer-only CRUD; HMAC-SHA256 signatures; 3 attempts with backoff in BackgroundTasks (never blocks requests); dead hooks proven harmless by e2e | A malicious organizer could point hooks at internal hosts (operator trust boundary) |
| Malformed input crashes | Pydantic validation → 422 (never 500); unknown slugs → 404; e2e NFR matrix covers 401/403/404/422 | None known |
| Dependency confusion / supply chain | Pinned `uv.lock` + `package-lock.json`; offline-capable images | `openai` dependency removed (was unused); remaining risk accepted |

## Deliberately accepted

- No per-request CSRF tokens, no audit-log hash chain, no multi-worker rate-limit store.
- Pairwise (Bradley-Terry) comparison exists as an informational ranking method,
  not as a voting mode.
