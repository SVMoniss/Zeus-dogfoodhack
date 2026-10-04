/**
 * Blog content model — Docker Blog format adaptation.
 *
 * docker.com/blog structure mirrored here:
 *  index: hero featured post + category tabs (All/Products/Community/
 *    Engineering/Company) + card grid (date, title, excerpt, author, Read now)
 *    + pagination
 *  detail: /blog/[slug] with hero, meta, body, related posts
 *
 * Full-length markdown versions of the two Write-Up Quest posts also live
 * in the repo-root `blog/` folder. This module is the in-app rendering copy
 * so the blog works offline inside `docker compose up` with no CMS.
 */

export type BlogCategory =
  | 'Engineering'
  | 'Products'
  | 'Community'
  | 'Company';

export const BLOG_CATEGORIES: ('All' | BlogCategory)[] = [
  'All',
  'Products',
  'Community',
  'Engineering',
  'Company',
];

export interface BlogAuthor {
  name: string;
  role: string;
  initials: string;
}

export interface BlogBlock {
  heading?: string;
  paragraphs: string[];
  code?: string;
  codeLang?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateISO: string;
  category: BlogCategory;
  author: BlogAuthor;
  readMinutes: number;
  featured?: boolean;
  tags: string[];
  gradient: string;
  /** Cover artwork in public/blog (Docker-blog style featured image). */
  image: string;
  blocks: BlogBlock[];
}

export const BLOG_AUTHORS: Record<string, BlogAuthor> = {
  zeus: { name: 'Team ZEUS', role: 'DOGFOOD 2026 builders', initials: 'ZX' },
  organizer: { name: 'Ada Okonkwo', role: 'Organizer, Sample Hack 2026', initials: 'AO' },
  judge: { name: 'Wei Lindqvist', role: 'Judge, Calibration Cup', initials: 'WL' },
};

const ZEUS = BLOG_AUTHORS.zeus;

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'setup-project-from-main',
    title: 'Run the whole platform with one command: setup guide (main branch)',
    excerpt:
      'Clone main, docker compose up, seed fixtures, test accounts, and the 7/7 acceptance checker — everything to go from zero to judging in minutes.',
    date: 'Oct 3, 2026',
    dateISO: '2026-10-03',
    category: 'Engineering',
    author: ZEUS,
    readMinutes: 9,
    featured: true,
    tags: ['docker-compose', 'fastapi', 'nextjs', 'postgres', 'pgvector', 'setup'],
    gradient: 'from-[#1F78D1] via-[#0A2A52] to-[#0A2A52]',
    image: '/blog/cover-setup.svg',
    blocks: [
      {
        heading: 'The one command',
        paragraphs: [
          'The main branch boots three containers with a single command: PostgreSQL 16 with pgvector on :5432, the FastAPI backend on :8000, and the Next.js 14 frontend on :3000. No local Python or Node toolchains required — uv, npm, Node 20 and Python 3.11 all run inside the containers.',
          'Clone, pin to main, and boot. First boot builds both app images, so give it a few minutes; later boots are fast.',
        ],
        code: 'git clone https://github.com/SVMoniss/Zeus-dogfoodhack.git dogfoodhack\ncd dogfoodhack\ngit checkout main\ndocker compose up',
        codeLang: 'bash',
      },
      {
        heading: 'What compose starts',
        paragraphs: [
          'postgres uses pgvector/pgvector:pg16 with db/user/password dogfood/dogfood, mounts init.sql (enables the vector and uuid-ossp extensions), and gates the other services on a pg_isready healthcheck.',
          'backend builds src/backend/Dockerfile (python:3.11-slim), mounts ./src/backend for live reload, and runs seed.py, then alembic upgrade head, then uvicorn. frontend builds src/frontend/Dockerfile (node:20-alpine) and runs next dev with WATCHPACK_POLLING=true, which is required on Windows bind mounts or Next serves stale pages.',
        ],
      },
      {
        heading: 'Seed data and test accounts',
        paragraphs: [
          'Boot auto-loads fixtures.json: 1 event (Sample Hack 2026, submissions already closed on purpose), 8 tracks, 30 judges, 40 teams and roughly 40 projects with ~200 scores.',
          'Four fixed checker users are created with tokens that match .dogfood.toml: organizer, judge_a, judge_b and participant (password testpass123 for manual login). Keep the default SECRET_KEY until after you run the checker — the committed cookies are HMAC-signed with it.',
        ],
        code: 'docker compose down -v   # wipes postgres_data for a clean reseed\ndocker compose up --build',
        codeLang: 'bash',
      },
      {
        heading: 'Verify: the 7/7 checker',
        paragraphs: [
          'run.py is stdlib-only — nothing to install. It checks the T1 gallery (public, fixture project shown, closed event refuses submissions) and the T2 judging guarantees (judge sees own scores, cannot see peer scores, participant blocked, CSV export works).',
          'Health endpoints double as smoke tests: /health is static, /health/ready opens a real DB connection, so a ready response means postgres, migrations and networking are all good.',
        ],
        code: 'python3 run.py .dogfood.toml > acceptance-report.txt\ncurl http://localhost:8000/health/ready\ncurl http://localhost:8000/docs  # interactive OpenAPI',
        codeLang: 'bash',
      },
      {
        heading: 'When it breaks',
        paragraphs: [
          'Five fixes cover nearly every setup failure: free ports 5432/8000/3000; run the checker before rotating SECRET_KEY; keep WATCHPACK_POLLING on Windows; use the compose postgres image so the vector extension exists; and keep backend FRONTEND_URL exactly matching the URL you open the frontend on, or CORS and auth cookies break.',
          'Full-length version of this guide with the service-by-service env table lives in the repo at blog/setup-project-from-main.md.',
        ],
      },
    ],
  },
  {
    slug: 'build-the-platform-that-will-judge-you',
    title: 'Build the platform that will judge you: how we built DOGFOOD 2026',
    excerpt:
      'FastAPI + Next.js + Postgres with backend-enforced judge isolation, z-score calibration and one-command Docker — our Write-Up Quest build log.',
    date: 'Oct 3, 2026',
    dateISO: '2026-10-03',
    category: 'Company',
    author: ZEUS,
    readMinutes: 11,
    tags: ['hackathon', 'judging-system', 'build-in-public', 'dogfood2026'],
    gradient: 'from-[#F59E0B] via-[#B45309] to-[#0A2A52]',
    image: '/blog/cover-build-story.svg',
    blocks: [
      {
        heading: 'The prompt',
        paragraphs: [
          'DOGFOOD 2026 in one line: build the platform that will judge you. Every team ships a submission and judging portal, then an automated acceptance checker grades their own portal against it.',
          '188 teams submitted. That constraint killed demo-ware early: if peer-score reads do not 403, if closed events accept submissions, if CSV export breaks — you fail, live, in front of the judges.',
        ],
      },
      {
        heading: 'What we shipped',
        paragraphs: [
          'T1 core: JWT httpOnly-cookie auth with five roles, events with server-enforced deadlines, invite-code teams, draft-to-submitted projects, and a public searchable gallery.',
          'T2 judging: track assignments, weighted rubrics frozen at exactly 100%, backend-enforced judge isolation, conflict and self-review blocks, progress dashboard, z-score calibration with Bradley-Terry and Borda views plus a ROBUST/FRAGILE boundary verdict, audit trail and CSV export.',
          'T3 voting and T4 stretch (API keys, HMAC webhooks, Ed25519 certificates, gallery widget, bulk import/export) round it out — see the product posts for those.',
        ],
      },
      {
        heading: 'Result',
        paragraphs: [
          'Claimed T1+T2, verified 7/7 PASS on run.py. Two reproducible demo events prove the awkward cases: Calibration Cup (4 judges × 30 projects) and Grand Jury (30 judges × 40 projects), both ending FRAGILE — raw #2 falls after calibration.',
          'The full 3,500-word build log is in the repo at blog/build-the-platform-that-will-judge-you.md and was submitted to the Write-Up Quest tally form.',
        ],
      },
    ],
  },
  {
    slug: 'fair-ranking-zscore-bradley-terry-borda',
    title: 'Fair ranking is not an average: z-scores, Bradley-Terry and Borda',
    excerpt:
      'Raw averages reward lucky judge draws. How per-judge calibration plus two extra ranking views produce a ROBUST/FRAGILE verdict organizers can defend.',
    date: 'Sep 28, 2026',
    dateISO: '2026-09-28',
    category: 'Engineering',
    author: BLOG_AUTHORS.judge,
    readMinutes: 8,
    tags: ['ranking', 'normalization', 'z-score', 'bradley-terry', 'borda'],
    gradient: 'from-[#0A2A52] via-[#1F78D1] to-[#22c55e]',
    image: '/blog/cover-ranking.svg',
    blocks: [
      {
        heading: 'The problem with averages',
        paragraphs: [
          'Lenient judges inflate every project they touch; harsh judges sink theirs. A raw average confuses generosity with quality.',
          'We calibrate per judge, per criterion: z = (s − μ_judge) / σ_judge, remapped into global scale as z × σ_global + μ_global. Constant scorers (σ = 0) fall back to raw and are flagged constant:true, excludable via /ranking?exclude_judge=.',
        ],
      },
      {
        heading: 'Three more views, one verdict',
        paragraphs: [
          'Over the same scores the organizer endpoint computes Bradley-Terry latent strengths from per-judge pairwise comparisons (ties skipped, disconnected-graph warning) and Borda points with fractional ties.',
          'The prize boundary (top-k, default 3) is ROBUST only when raw, calibrated, Bradley-Terry and Borda agree on the set above the line — otherwise FRAGILE with the disagreeing methods named. Both seeded demos flip: Food Rescue Route raw #2 → calibrated #5, Mural Mile raw #2 → calibrated #3.',
        ],
      },
      {
        heading: 'Why organizers trust it',
        paragraphs: [
          'Math alone does not convince anyone. The progress dashboard, raw-vs-calibrated CSV columns, low_confidence flags on thinly reviewed projects and the duplicates list (second Solar Kiosk counted once) make the calibration inspectable.',
          'Details and formulas: JUDGING.md. Reproduce: python demo-5min/seed_judging_demo.py and seed_grand_jury.py.',
        ],
      },
    ],
  },
  {
    slug: 'judge-isolation-backend-not-frontend',
    title: 'Judge isolation belongs in the backend, not the frontend',
    excerpt:
      'The #1 checker failure point across teams: judges must only see their own scores. How require_role deny-by-default plus 403s passes 7/7.',
    date: 'Sep 25, 2026',
    dateISO: '2026-09-25',
    category: 'Engineering',
    author: ZEUS,
    readMinutes: 6,
    tags: ['security', 'auth', 'fastapi', 'rbac'],
    gradient: 'from-[#7c2d12] via-[#0A2A52] to-[#1F78D1]',
    image: '/blog/cover-isolation.svg',
    blocks: [
      {
        heading: 'The rule',
        paragraphs: [
          'GET /api/judge/scores as judge_a returns 200. The same URL with ?judge=judge_a as judge_b must return 401/403. As participant, 401/403. No exceptions, no frontend hiding — the check lives in the FastAPI dependency.',
          'Judges requesting anything but their own id get a 403; organizers must pass an explicit judge_id; everyone else is denied. Verified live across seven role/endpoint combinations in ARCHITECTURE.md.',
        ],
        code: 'if current_user.role == UserRole.JUDGE:\n    if judge_id and judge_id != current_user.id:\n        raise HTTPException(403, "Cannot view other judge\'s scores")',
        codeLang: 'python',
      },
      {
        heading: 'Defense in depth',
        paragraphs: [
          'Self-review is blocked at POST /api/judge/scores/{id} (403 for team members), declared conflicts block scoring per project, and every scoring mutation appends an audit_events row.',
          'Playwright judge-isolation spec plus run.py prove it on every boot. Residual risk: none known — the one cell of the threat model we are fully green on.',
        ],
      },
    ],
  },
  {
    slug: 'community-voting-without-ballot-stuffing',
    title: 'Community voting without ballot stuffing',
    excerpt:
      'Email-gated tokens, deterministic per-token shuffles, hidden-until-published results and a vote_audit_log organizers can actually read.',
    date: 'Sep 20, 2026',
    dateISO: '2026-09-20',
    category: 'Products',
    author: BLOG_AUTHORS.organizer,
    readMinutes: 7,
    tags: ['voting', 'anti-abuse', 'community'],
    gradient: 'from-[#22c55e] via-[#0A2A52] to-[#1F78D1]',
    image: '/blog/cover-voting.svg',
    blocks: [
      {
        heading: 'Fair ballots',
        paragraphs: [
          'Votes start at POST /api/events/{id}/voting/token — 5 per hour per email. Ballot order is a deterministic per-token shuffle: fair ordering, stable reloads, no position bias.',
          'Results stay hidden from the public until results_published_at; organizers always see them. Comments go through an organizer approve queue.',
        ],
      },
      {
        heading: 'Abuse controls',
        paragraphs: [
          'One vote per person is a unique (event, project, voter_email) constraint, backed by per-IP rate limits and a duplicate-detection audit entry. Every issue, rejection and rate-limit lands in vote_audit_log with IP, email and user agent.',
          'Honest limit, stated in THREAT-MODEL.md: email is cheap, so determined Sybils need organizers to actually read the audit log. We built the log view for exactly that.',
        ],
      },
    ],
  },
  {
    slug: 'api-keys-webhooks-certificates',
    title: 'Stretch without sprawl: API keys, webhooks and verifiable certificates',
    excerpt:
      'Hashed X-API-Key REST with OpenAPI docs, HMAC webhooks with backoff, Ed25519 certificates and an embeddable gallery widget.',
    date: 'Sep 15, 2026',
    dateISO: '2026-09-15',
    category: 'Products',
    author: ZEUS,
    readMinutes: 7,
    tags: ['api', 'webhooks', 'certificates', 'integrations'],
    gradient: 'from-[#1F78D1] via-[#7c3aed] to-[#0A2A52]',
    image: '/blog/cover-integrations.svg',
    blocks: [
      {
        heading: 'API and webhooks',
        paragraphs: [
          '/api/v1/... keyed by X-API-Key with SHA-256 hashed storage, prefix display, expiry and revocation, plus interactive docs at /docs. Webhooks sign every payload with HMAC-SHA256 and retry 3 times with backoff in BackgroundTasks — never blocking the request.',
          'Fired on submit and score events. A malicious organizer pointing hooks at internal hosts is an documented operator-trust boundary, not a bug we pretend away.',
        ],
      },
      {
        heading: 'Proof people can keep',
        paragraphs: [
          'Certificates are Ed25519-signed and publicly checkable at /certificates/verify — participation, winner and judge-service types. The gallery widget (/api/events/{slug}/widget.js) embeds any event anywhere, and bulk JSON import/export tracks per-record errors as jobs.',
        ],
      },
    ],
  },
  {
    slug: 'one-command-demos-calibration-cup-grand-jury',
    title: 'Demos that rebuild in one command: Calibration Cup and Grand Jury',
    excerpt:
      'No screen-recorded clicks: node demo-5min/make.mjs narrates, records the browser tour to voice beats, and muxes both cuts from a fresh seed.',
    date: 'Sep 10, 2026',
    dateISO: '2026-09-10',
    category: 'Community',
    author: BLOG_AUTHORS.judge,
    readMinutes: 5,
    tags: ['demo', 'playwright', 'reproducibility'],
    gradient: 'from-[#0A2A52] via-[#F59E0B] to-[#22c55e]',
    image: '/blog/cover-demos.svg',
    blocks: [
      {
        heading: 'Two scenarios',
        paragraphs: [
          'Calibration Cup: 4 judges × 30 projects (seed 20260928), project i skips judge i mod 4, one constant-3.0 judge, two thinly reviewed projects, one duplicate Solar Kiosk. Grand Jury: the same idea at fixture scale, 30 judges × 40 projects, 118 rows (seed 20260929).',
          'Both write their assignment plan to the audit trail as assignment.generate with seed, rule and loads — then both verdicts land FRAGILE on camera.',
        ],
        code: 'python demo-5min/seed_judging_demo.py\nnode demo-5min/make.mjs   # narrate + record + mux',
        codeLang: 'bash',
      },
      {
        heading: 'What the videos show',
        paragraphs: [
          'e2e-demo-5min.mp4 (3:56): landing, Calibration Cup tour, duplicate side-by-side, live participant submit, audit trail, progress 23/22/21/23, live judge scoring, CSV download, then terminal proofs — 403s, FRAGILE diff, run.py 7/7 PASS. Narrated twins use offline TTS (Microsoft Zira) from demo-5min/narration/.',
        ],
      },
    ],
  },
  {
    slug: 'threat-model-accepted-risks',
    title: 'What we chose not to fix (yet): the threat-model edition',
    excerpt:
      'No audit hash-chain, no CSRF tokens, single-process rate limits — the accepted risks we disclose on screen instead of hiding.',
    date: 'Sep 5, 2026',
    dateISO: '2026-09-05',
    category: 'Company',
    author: ZEUS,
    readMinutes: 6,
    tags: ['security', 'threat-model', 'transparency'],
    gradient: 'from-[#334155] via-[#0A2A52] to-[#1F78D1]',
    image: '/blog/cover-threat.svg',
    blocks: [
      {
        heading: 'Deliberately accepted',
        paragraphs: [
          'Audit rows are organizer-visible but not tamper-proof (no hash chain). State-changing APIs rely on SameSite=Lax httpOnly JSON cookies with no per-request CSRF tokens. Rate limits live in a single-process store, so multi-worker deploys need a shared store.',
          'Pairwise Bradley-Terry stays an informational ranking method, not a voting mode. Pairwise voting would need a different abuse story.',
        ],
      },
      {
        heading: 'Why disclose',
        paragraphs: [
          'Writing THREAT-MODEL.md made judging Q&A easier, not harder — every residual has a mitigation, an owner, and a next step. Login brute force gets 100/min per (IP, email) → 429 plus ~100ms bcrypt; API keys are bearer-style until revoked; organizer screenshots during voting are out of scope and stated as such.',
        ],
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRelated(post: BlogPost, count = 3): BlogPost[] {
  const sameCat = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && p.category === post.category,
  );
  const rest = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && p.category !== post.category,
  );
  return [...sameCat, ...rest].slice(0, count);
}

export const FEATURED_POST: BlogPost =
  BLOG_POSTS.find((p) => p.featured) ?? BLOG_POSTS[0];
