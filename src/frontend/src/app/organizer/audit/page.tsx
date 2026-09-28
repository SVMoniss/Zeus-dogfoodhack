'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
}

/** Organizer audit log panel: GET /api/events/{slug}/audit. 401/403 => Access denied. */
export default function OrganizerAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);
  const [rows, setRows] = useState<AuditRow[]>([]);
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
    fetch(`${API_URL}/api/events/${slug}/audit?limit=100`, { credentials: 'include' }).then(
      async (res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) setDenied(true);
        else if (res.ok) setRows(await res.json());
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
          <p className="text-gray-600 mb-4">Only organizers can read the audit trail.</p>
          <Link href="/login" className="btn-primary">Sign in</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Audit Log</h1>
        <p className="text-gray-600 mb-6">{rows.length} recent events.</p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 px-3">Time</th>
                <th className="pb-2 px-3">Action</th>
                <th className="pb-2 px-3">Entity</th>
                <th className="pb-2 px-3">Actor</th>
                <th className="pb-2 px-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{r.created_at || '—'}</td>
                  <td className="py-2 px-3 font-mono text-xs">{r.action}</td>
                  <td className="py-2 px-3 font-mono text-xs">
                    {r.entity}:{r.entity_id?.slice(0, 8) || '—'}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{r.actor_id?.slice(0, 8) || '—'}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground max-w-72 truncate" title={JSON.stringify(r.details)}>
                    {typeof (r.details as { seed?: unknown }).seed !== 'undefined'
                      ? `seed ${(r.details as { seed?: unknown }).seed} · ${JSON.stringify(r.details)}`
                      : JSON.stringify(r.details)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No audit events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
