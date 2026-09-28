'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';

interface Progress {
  total_projects: number;
  judged_projects: number;
  pending_projects: number;
  total_judges: number;
  judges_completed: number;
  by_track: Record<string, { total: number; judged: number; pending: number }>;
  by_judge: Record<string, { name: string; track: string; total: number; completed: number }>;
}

/** Organizer dashboard: live progress from GET /api/events/{slug}/judging/progress. */
export default function OrganizerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const allowed = user && (user.role === 'organizer' || user.role === 'admin');

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) {
      setLoading(false);
      return;
    }
    // Only the latest slug's response wins (slug switches once for ?event=).
    let cancelled = false;
    fetch(`${API_URL}/api/events/${slug}/judging/progress`, { credentials: 'include' }).then(
      async (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) setDenied(true);
        else if (res.ok) setData(await res.json());
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [authLoading, allowed, slug]);

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }

  if (!allowed || denied) {
    return (
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-2">Access denied</h2>
          <p className="text-gray-600 mb-4">Only organizers can view the dashboard.</p>
          <Link href="/login" className="btn-primary">Sign in</Link>
        </main>
      </AppShell>
    );
  }

  if (!data) return <AppShell><main className="p-10 text-gray-500">No dashboard data.</main></AppShell>;

  const pct = data.total_projects > 0 ? Math.round((data.judged_projects / data.total_projects) * 100) : 0;

  return (
    <AppShell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Organizer Dashboard</h1>
        <p className="text-gray-600 mb-6">{pct}% judged</p>
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          {[
            ['Total', data.total_projects],
            ['Judged', data.judged_projects],
            ['Pending', data.pending_projects],
            ['Judges', `${data.judges_completed}/${data.total_judges}`],
          ].map(([k, v]) => (
            <div key={k} className="card">
              <p className="text-sm text-gray-500">{k}</p>
              <p className="text-3xl font-bold">{v}</p>
            </div>
          ))}
        </div>
        <div className="card mb-6 overflow-x-auto">
          <h2 className="font-bold mb-3">By Track</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 px-3">Track</th>
                <th className="pb-2 px-3">Total</th>
                <th className="pb-2 px-3">Judged</th>
                <th className="pb-2 px-3">Pending</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.by_track).map(([t, d]) => (
                <tr key={t} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-medium">{t}</td>
                  <td className="py-2 px-3">{d.total}</td>
                  <td className="py-2 px-3 text-green-700">{d.judged}</td>
                  <td className="py-2 px-3 text-yellow-700">{d.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <h2 className="font-bold mb-3">By Judge</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 px-3">Judge</th>
                <th className="pb-2 px-3">Track</th>
                <th className="pb-2 px-3">Completed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.by_judge).map(([jid, d]) => (
                <tr key={jid} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-medium">{d.name}</td>
                  <td className="py-2 px-3">{d.track}</td>
                  <td className="py-2 px-3">{d.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex gap-4">
          <Link href="/organizer/export" className="btn-primary">Export CSV</Link>
          <Link href="/organizer/audit" className="btn-secondary">Audit Log</Link>
        </div>
      </main>
    </AppShell>
  );
}
