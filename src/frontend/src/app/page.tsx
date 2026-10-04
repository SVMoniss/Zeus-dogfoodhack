'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Gavel,
  Globe,
  SlidersHorizontal,
  Trophy,
  Vote,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';
import { BrandLockup } from '@/components/Brand';
import { BLOG_POSTS } from '@/lib/blog';

const SUBMISSIONS_CLOSE_ISO = '2026-03-01T18:00:00Z';
const DEADLINE = Date.parse(SUBMISSIONS_CLOSE_ISO);

const TRACKS = [
  'Developer tools',
  'Data and analytics',
  'Accessibility',
  'Security',
  'Climate',
  'Health',
  'Education',
  'Open hardware',
];

const FORMATS = [
  {
    Icon: Globe,
    title: 'Public gallery',
    detail: 'Every submission showcased in a permanent, searchable gallery with repo, demo and video.',
    link: '/projects',
    cta: 'Browse projects',
  },
  {
    Icon: Gavel,
    title: 'Judging console',
    detail: 'Scoped assignments, draft reviews and normalized scoring — judges see only their queue.',
    link: '/judge',
    cta: 'Open judging',
  },
  {
    Icon: SlidersHorizontal,
    title: 'Organizer OS',
    detail: 'Events, judges, balanced assignment rounds, audit trail and CSV exports in one place.',
    link: '/organizer',
    cta: 'Run an event',
  },
  {
    Icon: Vote,
    title: 'Community vote',
    detail: 'One-person-one-vote or quadratic ballots, hidden until organizers publish results.',
    link: '/events/sample-hack-2026/vote',
    cta: 'Cast a vote',
  },
];

const GUIDES = [
  {
    kicker: 'Getting started',
    title: 'Ship your first submission in an afternoon',
    detail: 'Create an account, join a team, open a draft and submit before the deadline.',
    link: '/login',
    cta: 'Create an account',
  },
  {
    kicker: 'Judging handbook',
    title: 'How balanced reviews and normalization work',
    detail: 'Three independent reviews per project, calibrated before ranking. No black boxes.',
    link: '/events',
    cta: 'See live events',
  },
  {
    kicker: 'Self-host kit',
    title: 'Run the whole platform with one command',
    detail: 'Postgres, API and web app via Docker Compose. MIT licensed, demo data included.',
    link: '/projects',
    cta: 'Explore the gallery',
  },
];

const FAQS = [
  {
    q: 'What do we actually build?',
    a: 'A complete, self-hostable hackathon platform: authentication, events, teams, project submissions, judging with balanced assignment and normalized scoring, community voting, certificates and a REST API with webhooks. The organizers fork the winning build and run real events on it.',
  },
  {
    q: 'How does judging stay fair?',
    a: 'Every project receives the same number of independent reviews. Workloads stay within one review of each other, conflicts of interest and self-reviews are excluded, and harsh or generous scoring is corrected with per-judge normalization before ranking.',
  },
  {
    q: 'What are the key dates?',
    a: 'Submissions for Sample Hack 2026 close on 1 March 2026 at 18:00 UTC. Judging opens after the deadline and community voting runs alongside the judges.',
  },
  {
    q: 'Who owns the code?',
    a: 'You do. Everything is open source under the MIT License — which is exactly why the organizers can fork and self-host the winner.',
  },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function useCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, DEADLINE - now);
  return {
    closed: diff <= 0,
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff / 3_600_000) % 24),
    m: Math.floor((diff / 60_000) % 60),
    s: Math.floor((diff / 1000) % 60),
  };
}

function useLiveStats() {
  const [stats, setStats] = useState<{ projects: number | null; tracks: number | null }>({
    projects: null,
    tracks: null,
  });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const evRes = await fetch(`${API_URL}/api/events`, { credentials: 'include' });
        let slug = DEFAULT_EVENT_SLUG;
        if (evRes.ok) {
          const events = (await evRes.json()) as { slug: string }[];
          if (Array.isArray(events) && events.length > 0) {
            slug = events.find((e) => e.slug === DEFAULT_EVENT_SLUG)?.slug ?? events[0].slug;
          }
        }
        const [pRes, tRes] = await Promise.all([
          // limit=100: the endpoint pages at 20, but the hero needs the true total.
          fetch(`${API_URL}/api/events/${slug}/projects?limit=100`, { credentials: 'include' }),
          fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
        ]);
        if (!live) return;
        setStats({
          projects: pRes.ok ? ((await pRes.json()) as unknown[]).length : null,
          tracks: tRes.ok ? ((await tRes.json()) as unknown[]).length : null,
        });
      } catch {
        /* static fallback below */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return stats;
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const countdown = useCountdown();
  const live = useLiveStats();
  const dashboardHref =
    user?.role === 'judge'
      ? '/judge'
      : user?.role === 'organizer' || user?.role === 'admin'
        ? '/organizer'
        : user
          ? '/dashboard'
          : '/login';
  const projectCount = live.projects ?? 41;
  const trackCount = live.tracks ?? 8;

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <div className="bg-primary text-primary-foreground">
        <p className="mx-auto max-w-6xl px-5 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em]">
          Sample Hack 2026 · submissions close 1 Mar 18:00 UTC · {projectCount} projects in
        </p>
      </div>

      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link href="/" aria-label="DOGFOOD 2026 home">
            <BrandLockup markSize={26} />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground lg:flex" aria-label="Event sections">
            <a href="#formats" className="transition-colors hover:text-foreground">Formats</a>
            <a href="#platforms" className="transition-colors hover:text-foreground">Platforms</a>
            <a href="#guides" className="transition-colors hover:text-foreground">Guides</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
            <Link href="/projects" className="transition-colors hover:text-foreground">Projects</Link>
            <Link href="/events" className="transition-colors hover:text-foreground">Events</Link>
            <Link href="/blog" className="transition-colors hover:text-foreground">Blog</Link>
          </nav>
          <nav className="flex items-center gap-5 text-sm font-medium text-muted-foreground lg:hidden" aria-label="Main navigation">
            <Link href="/projects" className="transition-colors hover:text-foreground">Projects</Link>
            <Link href="/events" className="transition-colors hover:text-foreground">Events</Link>
            <Link href="/blog" className="transition-colors hover:text-foreground">Blog</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span data-testid="role-badge" className="badge">
                  {user.role}
                </span>
                <button
                  onClick={() => logout()}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
                <Link href={dashboardHref} className="btn-primary h-9 px-4 text-sm">
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
                  Sign in
                </Link>
                <Link href="/login" className="btn-primary h-9 px-4 text-sm">
                  Run a hackathon
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-surface/50">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-24">
          <p className="badge-primary mx-auto w-fit">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {countdown === null ? 'Sample Hack 2026' : countdown.closed ? 'Submissions closed · judging live' : 'Submissions open · 72 hours'}
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Run hackathons that ship{' '}
            <span className="underline decoration-primary decoration-4 underline-offset-8">real platforms</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            DOGFOOD 2026 is the hackathon where the product is the hackathon platform itself.
            Submissions, balanced judging and community voting in one self-hostable app — fast.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={user ? dashboardHref : '/login'} className="btn-full">
              {user ? 'Go to Dashboard' : 'Register your team'}
            </Link>
            <Link href="/projects" className="btn-board">
              Explore {projectCount} projects
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2" role="timer" aria-label="Countdown to submissions deadline">
            <TimeChip value={countdown ? pad(countdown.d) : '--'} label="days" />
            <TimeChip value={countdown ? pad(countdown.h) : '--'} label="hrs" />
            <TimeChip value={countdown ? pad(countdown.m) : '--'} label="min" />
            <TimeChip value={countdown ? pad(countdown.s) : '--'} label="sec" />
          </div>
          <dl className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-6 text-sm">
            <MiniStat label="Projects" value={String(projectCount)} />
            <MiniStat label="Tracks" value={String(trackCount)} />
            <MiniStat label="Judges" value="30" />
          </dl>
        </div>
      </section>

      <div className="overflow-hidden border-b border-border py-4" aria-label="Competition tracks">
        <div className="animate-marquee flex w-max items-center gap-8 pr-8">
          {[...TRACKS, ...TRACKS].map((t, i) => (
            <span key={i} aria-hidden={i >= TRACKS.length} className="flex items-center gap-8 whitespace-nowrap text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t}
              <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20" id="formats">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow-accent">One platform, every job</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">The right format for every builder</h2>
          <p className="mt-3 text-muted-foreground">
            Participants, judges and organizers each get a dedicated surface — connected by one backend.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FORMATS.map(({ Icon, title, detail, link, cta }) => (
            <div key={title} className="cut-frame">
              <article className="cut-card flex h-full flex-col p-6">
                <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
                <Link href={link} className="text-link mt-4 text-sm">
                  {cta}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/50" id="platforms">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow-accent">Two workspaces</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Built for teams and organizers</h2>
            <p className="mt-3 text-muted-foreground">The easiest way to launch and judge your next hackathon.</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="cut-frame">
              <article className="cut-card flex h-full flex-col p-8">
                <p className="eyebrow-accent">Participants</p>
                <h3 className="mt-2 text-2xl font-bold">Ship your best build</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Form a team, open a draft and submit before the deadline. Your work lives in a
                  permanent gallery with repo, demo and video attached.
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  <CheckItem text="Private drafts until you submit" />
                  <CheckItem text="One-click team formation from your dashboard" />
                  <CheckItem text="Certificates and results receipts for every entry" />
                  <CheckItem text="Community ballots alongside the judges" />
                </ul>
                <Link href={user ? dashboardHref : '/login'} className="btn-full mt-8 w-full">
                  {user ? 'Continue building' : 'Start building'}
                </Link>
              </article>
            </div>
            <div className="cut-frame">
              <article className="cut-card flex h-full flex-col p-8">
                <p className="eyebrow-accent">Organizers</p>
                <h3 className="mt-2 text-2xl font-bold">Judging you can defend</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Balanced assignment, per-judge normalization and a full audit trail — run a fair
                  event without spreadsheets.
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  <CheckItem text="Every project gets 3 independent reviews" />
                  <CheckItem text="Conflicts and self-reviews excluded by the server" />
                  <CheckItem text="Frozen rubrics, CSV exports at every stage" />
                  <CheckItem text="Self-hostable with Docker Compose and MIT license" />
                </ul>
                <Link href="/events" className="btn-full mt-8 w-full">
                  Explore live events
                </Link>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20">
        <div className="cut bg-primary-800">
          <figure className="cut bg-surface px-8 py-10 sm:px-14">
            <blockquote className="mx-auto max-w-3xl text-center font-serif text-2xl italic leading-snug sm:text-[1.7rem]">
              “The organizers will fork the winning project and run their own events on it. Build
              the platform that will judge you.”
            </blockquote>
            <figcaption className="mt-5 text-center">
              <p className="text-sm font-bold">DOGFOOD 2026 rulebook</p>
              <p className="text-sm text-muted-foreground">The grand prize is distribution</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-t border-border bg-surface/50" id="guides">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow-accent">Guides</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to win</h2>
            <p className="mt-3 text-muted-foreground">Practical paths for first-timers and returning builders.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {GUIDES.map((g) => (
              <article key={g.title} className="card flex flex-col">
                <p className="eyebrow-accent">{g.kicker}</p>
                <h3 className="mt-2 text-xl font-bold leading-snug">{g.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{g.detail}</p>
                <Link href={g.link} className="text-link mt-5 text-sm">
                  {g.cta}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20" id="blog">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow-accent">DOGFOOD Blog</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Build logs from the team</h2>
            <p className="mt-3 text-muted-foreground">Setup guides, judging math and self-host notes — same format as docker.com/blog.</p>
          </div>
          <Link href="/blog" className="text-link text-sm">
            View all posts
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {BLOG_POSTS.slice(0, 3).map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="listing-card group flex flex-col">
              <div aria-hidden="true" className="relative h-32 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="ribbon bg-black/45">{p.category}</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[13px] text-muted-foreground">{p.date} · {p.readMinutes} min read</p>
                <h3 className="mt-1.5 font-bold leading-snug group-hover:text-primary">{p.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.excerpt}</p>
                <span className="text-link mt-4 text-sm">
                  Read now
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20" id="faq">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow-accent">Before you ask</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
            <p className="mt-3 text-muted-foreground">
              The essentials. Anything else — ask an organizer in the event channel.
            </p>
            <Link href={user ? dashboardHref : '/login'} className="btn-full mt-8">
              <span className="flex items-center gap-2">
                {user ? 'Go to Dashboard' : 'Register now'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-border rounded-[0.625rem] border border-border bg-card">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="font-medium text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function TimeChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-[4.2rem] rounded-[0.625rem] border border-border bg-card px-3 py-2.5">
      <p className="font-mono text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
        <Check className="h-3 w-3 text-primary" />
      </span>
      <span className="font-medium">{text}</span>
    </li>
  );
}
