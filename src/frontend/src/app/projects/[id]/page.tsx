'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CalendarDays, Users } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { DetailBanner } from '@/components/Listing';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';
import type { Project } from '@/types';

/** Public software page. No auth required; resolves the event via the events list. */
export default function PublicProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        let slugs: string[] = [DEFAULT_EVENT_SLUG];
        try {
          const evRes = await fetch(`${API_URL}/api/events`, { credentials: 'include' });
          if (evRes.ok) {
            const events = await evRes.json();
            if (Array.isArray(events) && events.length > 0) {
              slugs = events.map((e: { slug: string }) => e.slug);
              // Prefer the fixture event first.
              slugs.sort((a, b) => (a === DEFAULT_EVENT_SLUG ? -1 : b === DEFAULT_EVENT_SLUG ? 1 : 0));
            }
          }
        } catch {
          /* use default slug */
        }
        for (const slug of slugs) {
          const res = await fetch(`${API_URL}/api/events/${slug}/projects/${id}`, {
            credentials: 'include',
          });
          if (res.ok) {
            setProject(await res.json());
            return;
          }
        }
        setNotFound(true);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  return (
    <AppShell>
      {loading ? (
        <p className="py-20 text-center font-mono text-sm text-muted-foreground">Loading software…</p>
      ) : notFound || !project ? (
        <div className="py-20 text-center">
          <h2 className="text-2xl font-bold">Software not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">It may have been removed or never submitted.</p>
          <Link href="/projects" className="btn-full mt-6">
            Back to Gallery
          </Link>
        </div>
      ) : (
        <div className="py-10">
          <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All software
          </Link>

          <div className="cut-frame mt-4">
            <div className="cut-card overflow-hidden">
              <DetailBanner title={project.title} ribbon={project.track_name || undefined} ribbonClass="bg-primary-700" />
              <div className="p-6 sm:p-8">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    {project.team_name || 'Independent'}
                  </span>
                  {project.submitted_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Submitted {new Date(project.submitted_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                    </span>
                  )}
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{project.title}</h1>
                {project.summary && <p className="mt-2 text-lg text-muted-foreground">{project.summary}</p>}
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {project.repo_url && (
                    <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="btn-board h-10 px-4 text-sm">
                      Repository
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                  {project.demo_url && (
                    <a href={project.demo_url} target="_blank" rel="noopener noreferrer" className="btn-full h-10 px-4 text-sm">
                      Live Demo
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                  {project.video_url && (
                    <a href={project.video_url} target="_blank" rel="noopener noreferrer" className="btn-board h-10 px-4 text-sm">
                      Video
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {project.description && (
            <div className="card mt-5">
              <h2 className="eyebrow">Story</h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">{project.description}</p>
            </div>
          )}

          <div className="card mt-5">
            <h2 className="eyebrow">Details</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Team</dt>
                <dd className="mt-0.5 font-semibold">{project.team_name || 'Independent'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Track</dt>
                <dd className="mt-0.5 font-semibold">{project.track_name || 'General'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5 font-semibold">{project.is_draft ? 'Draft' : 'Submitted'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </AppShell>
  );
}
