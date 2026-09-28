'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import { DetailBanner, ListingThumb, splitEventTitle, EventIdTag } from '@/components/Listing';
import { ArrowLeft, ArrowUpRight, CalendarDays, Trophy, Users } from 'lucide-react';
import type { Event, ProjectListItem, Track } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function fmt(iso: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'TBC'
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function EventDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { title: eventTitle, runId: eventRunId } = splitEventTitle(event?.name ?? '');
  const [activeTab, setActiveTab] = useState<'overview' | 'submissions'>('overview');

  useEffect(() => {
    (async () => {
      try {
        const [eventRes, tracksRes, projectsRes] = await Promise.all([
          fetch(`${API_URL}/api/events/${slug}`, { credentials: 'include' }),
          fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
          // limit=100: the endpoint pages at 20, but event views need the full set.
          fetch(`${API_URL}/api/events/${slug}/projects?limit=100`, { credentials: 'include' }),
        ]);
        if (eventRes.ok) setEvent(await eventRes.json());
        if (tracksRes.ok) setTracks(await tracksRes.json());
        if (projectsRes.ok) setProjects(await projectsRes.json());
      } catch {
        /* error state below */
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const isParticipant =
    user?.role === 'participant' ||
    user?.role === 'judge' ||
    user?.role === 'organizer' ||
    user?.role === 'admin';

  return (
    <AppShell>
      {loading || authLoading ? (
        <p className="py-20 text-center font-mono text-sm text-muted-foreground">Loading hackathon…</p>
      ) : !event ? (
        <div className="py-20 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold">Hackathon not found</h2>
          <Link href="/events" className="btn-full mt-6">
            Back to Hackathons
          </Link>
        </div>
      ) : (
        <div className="py-10">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All hackathons
          </Link>

          <div className="cut-frame mt-4">
            <div className="cut-card overflow-hidden">
              <DetailBanner
                title={eventTitle}
                ribbon={event.is_active ? 'Open' : 'Closed'}
                ribbonClass={event.is_active ? 'bg-green-600' : 'bg-slate-500'}
              />
              <div className="p-6 sm:p-8">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{eventTitle}</h1>
                {eventRunId && <EventIdTag runId={eventRunId} />}
                <p className="mt-2 max-w-2xl text-muted-foreground">
                  {event.description || 'No description yet.'}
                </p>
                <dl className="mt-6 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground text-xs">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Submissions
                    </dt>
                    <dd className="mt-1 font-medium">{fmt(event.submissions_open_at)} – {fmt(event.submissions_close_at)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground text-xs">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" /> Projects
                    </dt>
                    <dd className="mt-1 font-medium">{projects.length} submitted</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground text-xs">
                      <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Tracks
                    </dt>
                    <dd className="mt-1 font-medium">{tracks.length} ways to win</dd>
                  </div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {isParticipant ? (
                    <Link href={`/events/${slug}/submit`} className="btn-full">
                      Submit a project
                    </Link>
                  ) : (
                    <Link href="/login" className="btn-full">
                      Join this hackathon
                    </Link>
                  )}
                  <Link href={`/events/${slug}/gallery`} className="btn-board">
                    Browse submissions
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-b border-border" role="tablist" aria-label="Event sections">
            {(['overview', 'submissions'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => setActiveTab(t)}
                className={`mr-8 border-b-2 pb-3 text-sm font-semibold capitalize transition-colors ${
                  activeTab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <div className="card">
                <h2 className="eyebrow">Timeline</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Submissions open</dt>
                    <dd className="font-semibold">{fmt(event.submissions_open_at)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Submissions close</dt>
                    <dd className="font-semibold">{fmt(event.submissions_close_at)}</dd>
                  </div>
                  {event.voting_open_at && (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Voting</dt>
                      <dd className="font-semibold">{fmt(event.voting_open_at)} – {fmt(event.voting_close_at)}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="card">
                <h2 className="eyebrow">Tracks</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tracks.length === 0 && <p className="text-sm text-muted-foreground">No tracks defined yet.</p>}
                  {tracks.map((t) => (
                    <span key={t.id} className="badge">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-8 rounded-[0.625rem] border border-dashed border-border px-6 py-14 text-center">
              <p className="font-semibold">No submissions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Be the first to ship something great.</p>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/events/${slug}/projects/${p.id}`} className="listing-card">
                  <ListingThumb title={p.title} ribbon={p.track_name || undefined} ribbonClass="bg-primary-700" />
                  <div className="p-5">
                    <h3 className="text-lg font-bold leading-snug">{p.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary || 'No summary yet.'}</p>
                    <p className="mt-3 border-t border-border pt-3 text-[13px] font-medium">{p.team_name}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
