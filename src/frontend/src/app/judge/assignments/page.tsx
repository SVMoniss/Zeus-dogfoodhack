'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';
import type { ProjectListItem } from '@/types';

/**
 * Judge assignments worklist. Derived from real backend data:
 * gallery projects joined with the judge's own scores (GET /api/judge/scores).
 * 401/403 on the scores endpoint => Access denied panel.
 */
export default function JudgeAssignmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [scoredIds, setScoredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch(`${API_URL}/api/events/${DEFAULT_EVENT_SLUG}/projects`, { credentials: 'include' }),
          fetch(`${API_URL}/api/judge/scores`, { credentials: 'include' }),
        ]);
        if (sRes.status === 401 || sRes.status === 403) {
          setDenied(true);
          return;
        }
        if (pRes.ok) setProjects(await pRes.json());
        if (sRes.ok) {
          const scores = await sRes.json();
          setScoredIds(new Set(scores.map((s: { project_id: string }) => s.project_id)));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }

  if (!user || denied) {
    return (
      <AppShell>
        <AccessDenied message="Only judges can view assignments." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Assignments</h1>
        <p className="text-gray-600 mb-6">
          {projects.length} projects · {scoredIds.size} scored
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/judge/project/${p.id}`} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-gray-900">{p.title}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    scoredIds.has(p.id) ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {scoredIds.has(p.id) ? 'Scored' : 'Pending'}
                </span>
              </div>
              <p className="text-sm text-gray-600 line-clamp-2 mb-2">{p.summary}</p>
              <p className="text-xs text-gray-500">
                {p.team_name} · {p.track_name}
              </p>
            </Link>
          ))}
          {projects.length === 0 && <p className="text-gray-500">No projects available.</p>}
        </div>
      </main>
    </AppShell>
  );
}
