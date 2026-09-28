'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

interface Score {
  id: string;
  project_id: string;
  criteria_id: string;
  score: number;
  comment: string | null;
}

/**
 * Judge scores flow: GET /api/judge/scores as the current judge => 200
 * score table by project/criteria. 401/403 => "Access denied" panel.
 * Never hides peer data in UI only — isolation is server-enforced.
 */
export default function JudgeScoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/judge/scores`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          setDenied(true);
          return;
        }
        if (!res.ok) throw new Error(`Scores returned ${res.status}`);
        setScores(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load scores');
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
        <AccessDenied message="Only judges can read their own scores. Participants and guests get 401/403 from the server." />
      </AppShell>
    );
  }

  const byProject = new Map<string, Score[]>();
  for (const s of scores) {
    const list = byProject.get(s.project_id) || [];
    list.push(s);
    byProject.set(s.project_id, list);
  }

  return (
    <AppShell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Scores</h1>
        <p className="text-gray-600 mb-6">
          {scores.length} score{scores.length === 1 ? '' : 's'} — visible only to you
          {user.role === 'judge' ? ' (and organizers via export).' : '.'}
        </p>
        {error && (
          <p className="text-red-600 mb-4" role="alert">
            {error}
          </p>
        )}
        {scores.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">No scores yet. Pick a project to score.</p>
            <Link href="/judge/assignments" className="btn-primary">
              View Assignments
            </Link>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-3 px-4">Project</th>
                  <th className="pb-3 px-4">Criteria</th>
                  <th className="pb-3 px-4">Score</th>
                  <th className="pb-3 px-4">Comment</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byProject.entries()).map(([projectId, rows]: [string, Score[]]) =>
                  rows.map((s: Score) => (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Link href={`/judge/project/${projectId}`} className="text-primary-600 hover:underline font-mono text-xs">
                          {projectId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{s.criteria_id.slice(0, 8)}…</td>
                      <td className="py-3 px-4 font-bold">{s.score}</td>
                      <td className="py-3 px-4 text-gray-600">{s.comment || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
