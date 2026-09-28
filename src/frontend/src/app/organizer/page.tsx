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
}

/** Organizer landing: progress dashboard summary + export CSV button + audit link. */
export default function OrganizerPage() {
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [denied, setDenied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  const allowed = user && (user.role === 'organizer' || user.role === 'admin');

  useEffect(() => {
    if (authLoading || !allowed) return;
    // Only the latest slug's response wins (slug switches once for ?event=).
    let cancelled = false;
    fetch(`${API_URL}/api/events/${slug}/judging/progress`, { credentials: 'include' }).then(
      async (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) setDenied(true);
        else if (res.ok) setProgress(await res.json());
      }
    );
    return () => {
      cancelled = true;
    };
  }, [authLoading, allowed, slug]);

  const exportCsv = async () => {
    setExporting(true);
    setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/export.csv`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setNotice('Access denied — organizer only.');
        return;
      }
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-results.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setNotice('CSV downloaded as attachment.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Organizer</h1>
        <p className="text-gray-600 mb-8">Progress dashboard, CSV export, and audit log.</p>
        {!authLoading && !allowed ? (
          <div className="card" role="alert">
            <h2 className="font-bold text-lg mb-1">Access denied</h2>
            <p className="text-sm text-gray-600 mb-4">Sign in as an organizer.</p>
            <Link href="/login" className="btn-primary">Sign in</Link>
          </div>
        ) : denied ? (
          <div className="card" role="alert">
            <h2 className="font-bold text-lg mb-1">Access denied</h2>
            <p className="text-sm text-gray-600">The server refused (401/403).</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3 mb-8">
              <div className="card">
                <p className="text-sm text-gray-500">Projects</p>
                <p className="text-3xl font-bold">{progress ? `${progress.judged_projects}/${progress.total_projects}` : '…'}</p>
                <p className="text-xs text-gray-500">judged / total</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-500">Judges done</p>
                <p className="text-3xl font-bold">{progress ? `${progress.judges_completed}/${progress.total_judges}` : '…'}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-3xl font-bold">{progress ? progress.pending_projects : '…'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <button onClick={exportCsv} disabled={exporting} className="btn-primary">
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              <Link href="/organizer/dashboard" className="btn-secondary">Full Dashboard</Link>
              <Link href="/organizer/audit" className="btn-secondary">Audit Log</Link>
            </div>
            {notice && <p className="text-sm text-gray-600 mt-4">{notice}</p>}
          </>
        )}
      </main>
    </AppShell>
  );
}
