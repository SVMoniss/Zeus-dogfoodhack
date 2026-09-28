'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ExternalLink, Search } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { ListingThumb } from '@/components/Listing';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';
import type { ProjectListItem, Track } from '@/types';

/**
 * Public software gallery. No auth required.
 * Fetches GET /api/events/{slug}/projects and renders a 200 page
 * for unauthenticated users with title/summary/team/track cards.
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        // Resolve event slug: prefer the seeded fixture event, fall back to first event.
        let slug = DEFAULT_EVENT_SLUG;
        try {
          const evRes = await fetch(`${API_URL}/api/events`, { credentials: 'include' });
          if (evRes.ok) {
            const events = await evRes.json();
            if (Array.isArray(events) && events.length > 0) {
              const match = events.find((e: { slug: string }) => e.slug === DEFAULT_EVENT_SLUG);
              slug = (match || events[0]).slug;
            }
          }
        } catch {
          /* keep default slug */
        }
        const [pRes, tRes] = await Promise.all([
          fetch(`${API_URL}/api/events/${slug}/projects`, { credentials: 'include' }),
          fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
        ]);
        if (!pRes.ok) throw new Error(`Gallery returned ${pRes.status}`);
        setProjects(await pRes.json());
        if (tRes.ok) setTracks(await tRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load gallery');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      const matches =
        q.length === 0 ||
        p.title.toLowerCase().includes(q) ||
        (p.summary || '').toLowerCase().includes(q) ||
        (p.team_name || '').toLowerCase().includes(q);
      return matches && (!trackFilter || p.track_name === trackFilter);
    });
  }, [projects, search, trackFilter]);

  return (
    <AppShell>
      <div className="py-10">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Submitted projects</h1>
          <p className="mt-2 text-muted-foreground">
            Explore what the community built. Public gallery — no sign-in required.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="search-wrap max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search title, team, or tag…"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by track"
            className="input h-12 w-auto"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
          >
            <option value="">All tracks</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="mt-10 font-mono text-sm text-muted-foreground">Loading projects…</p>
        ) : error ? (
          <p className="mt-10 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <div className="mt-10 rounded-[0.625rem] border border-dashed border-border px-6 py-16 text-center">
            <h3 className="text-lg font-bold">
              {projects.length === 0 ? 'Nothing submitted yet' : 'No projects match'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {projects.length === 0 ? 'Be the first to ship something great.' : 'Try a different search or track.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm text-muted-foreground" aria-live="polite">
              {filtered.length} project{filtered.length === 1 ? '' : 's'}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="listing-card">
                  <ListingThumb title={p.title} ribbon={p.track_name || undefined} ribbonClass="bg-primary-700" />
                  <div className="p-5">
                    <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.summary || 'No summary yet.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-[13px] text-muted-foreground">
                      <span className="truncate font-medium text-foreground">{p.team_name}</span>
                      <span className="flex shrink-0 items-center gap-2.5">
                        {p.repo_url && (
                          <span className="inline-flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" aria-hidden="true" /> Repo
                          </span>
                        )}
                        {p.demo_url && (
                          <span className="inline-flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> Demo
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
