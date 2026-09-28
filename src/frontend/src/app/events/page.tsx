'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Search, Trophy } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { ListingThumb, splitEventTitle, EventIdTag } from '@/components/Listing';
import type { Event } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Filter = 'all' | 'open' | 'judging' | 'closed';

function statusOf(e: Event): { label: string; ribbon: string } {
  const now = Date.now();
  const open = Date.parse(e.submissions_open_at);
  const close = Date.parse(e.submissions_close_at);
  if (Number.isFinite(open) && now < open) return { label: 'Upcoming', ribbon: 'bg-slate-500' };
  if (Number.isFinite(close) && now <= close) return { label: 'Open', ribbon: 'bg-green-600' };
  if (e.voting_open_at && e.voting_close_at) {
    const vo = Date.parse(e.voting_open_at);
    const vc = Date.parse(e.voting_close_at);
    if (Number.isFinite(vo) && Number.isFinite(vc) && now >= vo && now <= vc)
      return { label: 'Voting', ribbon: 'bg-primary-600' };
  }
  return { label: 'Judging', ribbon: 'bg-amber-600' };
}

function fmt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'TBC'
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/events`, { credentials: 'include' });
        if (res.ok) setEvents(await res.json());
      } catch {
        /* offline — empty state below */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (q && !(e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q)))
        return false;
      if (filter === 'all') return true;
      const s = statusOf(e).label.toLowerCase();
      if (filter === 'open') return s === 'open' || s === 'upcoming';
      if (filter === 'judging') return s === 'judging' || s === 'voting';
      return s !== 'open' && s !== 'upcoming' && s !== 'judging' && s !== 'voting';
    });
  }, [events, query, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All hackathons' },
    { id: 'open', label: 'Open & upcoming' },
    { id: 'judging', label: 'Judging' },
    { id: 'closed', label: 'Past' },
  ];

  return (
    <AppShell>
      <div className="py-10">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Join the world&apos;s best hackathons</h1>
          <p className="mt-2 text-muted-foreground">
            Browse live events. Submit a project, judge submissions, and vote for your favorites.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="search-wrap max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search hackathons"
              placeholder="Search hackathons…"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {chips.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={`chip ${filter === c.id ? 'chip-active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-10 font-mono text-sm text-muted-foreground">Loading hackathons…</p>
        ) : visible.length === 0 ? (
          <div className="mt-10 rounded-[0.625rem] border border-dashed border-border px-6 py-16 text-center">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold">{events.length === 0 ? 'No hackathons yet' : 'No matches'}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {events.length === 0 ? 'Check back soon — new events open all the time.' : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm text-muted-foreground" aria-live="polite">
              {visible.length} hackathon{visible.length === 1 ? '' : 's'}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((event) => {
                const s = statusOf(event);
                const { title, runId } = splitEventTitle(event.name);
                return (
                  <Link key={event.id} href={`/events/${event.slug}`} className="listing-card">
                    <ListingThumb title={title} ribbon={s.label} ribbonClass={s.ribbon} />
                    <div className="p-5">
                      <h3 className="text-lg font-bold leading-snug">{title}</h3>
                      {runId && <EventIdTag runId={runId} />}
                      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {fmt(event.submissions_open_at)} – {fmt(event.submissions_close_at)} · Online
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {event.description || 'No description yet.'}
                      </p>
                      <span className="text-link mt-3 text-sm">
                        View hackathon
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
