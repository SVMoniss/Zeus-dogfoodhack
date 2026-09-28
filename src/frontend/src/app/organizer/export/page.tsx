'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';

/** Organizer-only CSV export: button calls GET /api/events/{slug}/export.csv, downloads attachment. */
export default function OrganizerExportPage() {
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);

  const allowed = user && (user.role === 'organizer' || user.role === 'admin');

  const exportCsv = async () => {
    setExporting(true);
    setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/export.csv`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        setNotice('Access denied — organizer only (server returned 401/403).');
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

  if (authLoading) {
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
          <p className="text-gray-600 mb-4">{notice || 'Only organizers can export CSV data.'}</p>
          <Link href="/login" className="btn-primary">Sign in</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Download className="h-14 w-14 text-green-600 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Export Results</h1>
        <p className="text-gray-600 mb-6">Downloads GET /api/events/{slug}/export.csv as a CSV attachment.</p>
        <button onClick={exportCsv} disabled={exporting} className="btn-primary px-8 py-3">
          {exporting ? 'Exporting…' : 'Download CSV'}
        </button>
        {notice && <p className="text-sm text-gray-600 mt-4">{notice}</p>}
      </main>
    </AppShell>
  );
}
