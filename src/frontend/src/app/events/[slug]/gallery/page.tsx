'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { ListingThumb, splitEventTitle } from '@/components/Listing';
import { ArrowLeft, Search } from 'lucide-react';
import { Event, ProjectListItem, Track } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function GalleryPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const { title: galleryEventTitle, runId: galleryEventRunId } = splitEventTitle(event?.name ?? '');

  useEffect(() => {
    fetchEvent();
  }, [slug]);

  const fetchEvent = async () => {
    try {
      const [eventRes, tracksRes, projectsRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
        // limit=100: the endpoint pages at 20, but the gallery shows the full set.
        fetch(`${API_URL}/api/events/${slug}/projects?limit=100`, { credentials: 'include' }),
      ]);

      if (eventRes.ok) setEvent(await eventRes.json());
      if (tracksRes.ok) setTracks(await tracksRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
    } catch (err) {
      console.error('Failed to fetch event:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.summary || '').toLowerCase().includes(search.toLowerCase());
    const matchesTrack = !trackFilter || p.track_name === trackFilter;
    return matchesSearch && matchesTrack;
  });

  if (loading) {
    return (
      <AppShell>
        <p className="py-20 text-center font-mono text-sm text-muted-foreground">Loading submissions…</p>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <h2 className="text-2xl font-bold">Hackathon not found</h2>
          <Link href="/events" className="btn-full mt-4 inline-flex">
            Back to Hackathons
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="py-10">
        <Link href={`/events/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {galleryEventTitle}
          {galleryEventRunId && (
            <span className="font-mono text-[11px]">#{galleryEventRunId}</span>
          )}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              {filteredProjects.length} project{filteredProjects.length === 1 ? '' : 's'}
              {event.prizes && event.prizes.length > 0 && (
                <> · Prizes: {event.prizes.map((p) => p.title).join(', ')}</>
              )}
            </p>
          </div>
          <Link href={`/events/${slug}/vote`} className="btn-full h-10 px-4 text-sm">
            Community Vote
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="search-wrap max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search submissions"
              placeholder="Search submissions…"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input h-12 w-auto" aria-label="Filter by track" value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
            <option value="">All tracks</option>
            {tracks.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="mt-10 rounded-[0.625rem] border border-dashed border-border px-6 py-16 text-center">
            <h3 className="text-lg font-bold">No submissions yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Be the first to ship something great.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Link key={project.id} href={`/events/${slug}/projects/${project.id}`} className="listing-card">
                <ListingThumb title={project.title} ribbon={project.track_name || undefined} ribbonClass="bg-primary-700" />
                <div className="p-5">
                  <h3 className="text-lg font-bold leading-snug">{project.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.summary || 'No summary yet.'}</p>
                  <p className="mt-3 border-t border-border pt-3 text-[13px] font-medium">{project.team_name}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}