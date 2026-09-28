'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG, isSubmissionsClosedMessage } from '@/lib/api';
import type { Track } from '@/types';

/**
 * Participant submission flow. Only participants in a team can submit.
 * POSTs to /api/events/{slug}/projects. When the event is closed the
 * server returns 4xx and the UI shows "Submissions closed".
 */
export default function NewProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [eventClosed, setEventClosed] = useState(false);
  const [form, setForm] = useState({
    title: '',
    summary: '',
    description: '',
    repo_url: '',
    demo_url: '',
    track_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Discard stale responses: the slug switches once from the default to
    // ?event= on mount, and the two fetches race — only the latest wins.
    let cancelled = false;
    const load = async () => {
      setEventClosed(false);
      try {
        const [tRes, eRes] = await Promise.all([
          fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
          fetch(`${API_URL}/api/events/${slug}`, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (tRes.ok) setTracks(await tRes.json());
        if (eRes.ok) {
          const ev = await eRes.json();
          const closeAt = ev.submissions_close_at || ev.submissions_close;
          if (closeAt && new Date(closeAt).getTime() < Date.now()) setEventClosed(true);
        }
      } catch {
        /* best effort */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }
  if (!user) return <AppShell><AccessDenied message="Sign in as a participant to submit." /></AppShell>;
  if (user.role !== 'participant' && user.role !== 'admin') {
    return <AppShell><AccessDenied message="Only participants can submit projects." /></AppShell>;
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.summary.trim()) errs.summary = 'Summary is required';
    if (!form.track_id) errs.track_id = 'Track is required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title,
          summary: form.summary,
          description: form.description || null,
          repo_url: form.repo_url || null,
          demo_url: form.demo_url || null,
          track_id: form.track_id || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { detail?: string }).detail || `Submission failed (${res.status})`;
        if (res.status >= 400 && res.status < 500 && isSubmissionsClosedMessage(msg)) {
          setEventClosed(true);
          setErrors({ submit: 'Submissions closed for this event.' });
        } else {
          setErrors({ submit: msg });
        }
        return;
      }
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">New Submission</h1>
        {eventClosed ? (
          <div className="card border-yellow-300 bg-yellow-50" role="alert">
            <h2 className="font-bold text-yellow-900 mb-1">Submissions closed</h2>
            <p className="text-sm text-yellow-800">
              This event no longer accepts submissions. The server refused new projects (4xx).
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-5 mt-4">
            {errors.submit && (
              <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
                {errors.submit}
              </p>
            )}
            <div>
              <label className="label" htmlFor="title">Title *</label>
              <input id="title" className="input" value={form.title} onChange={set('title')} required />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            </div>
            <div>
              <label className="label" htmlFor="summary">Summary *</label>
              <textarea id="summary" className="input" rows={2} value={form.summary} onChange={set('summary')} required />
              {errors.summary && <p className="text-red-500 text-sm mt-1">{errors.summary}</p>}
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" className="input" rows={4} value={form.description} onChange={set('description')} />
            </div>
            <div>
              <label className="label" htmlFor="repo_url">Repository URL</label>
              <input id="repo_url" className="input" value={form.repo_url} onChange={set('repo_url')} placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="demo_url">Demo URL</label>
              <input id="demo_url" className="input" value={form.demo_url} onChange={set('demo_url')} placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="track_id">Track *</label>
              <select id="track_id" className="input" value={form.track_id} onChange={set('track_id')} required>
                <option value="">Select a track</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {errors.track_id && <p className="text-red-500 text-sm mt-1">{errors.track_id}</p>}
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
              {submitting ? 'Submitting…' : 'Submit Project'}
            </button>
            <p className="text-xs text-gray-500">You must be in a team — see /teams.</p>
          </form>
        )}
      </main>
    </AppShell>
  );
}
