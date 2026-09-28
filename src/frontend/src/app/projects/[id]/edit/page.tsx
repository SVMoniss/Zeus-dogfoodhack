'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG, isSubmissionsClosedMessage } from '@/lib/api';

/** Participant edit flow: PATCH /api/events/{slug}/projects/{id}. Closed => "Submissions closed". */
export default function EditProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // Event-aware like the submit page: ?event=<slug> targets the project’s
  // event (hardcoding the default slug 404s every other event’s projects).
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);

  const [form, setForm] = useState({ title: '', summary: '', description: '', repo_url: '', demo_url: '' });
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/events/${slug}/projects/${id}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          setError(`Project not found (${res.status})`);
          return;
        }
        const p = await res.json();
        setForm({
          title: p.title || '',
          summary: p.summary || '',
          description: p.description || '',
          repo_url: p.repo_url || '',
          demo_url: p.demo_url || '',
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, slug]);

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }
  if (!user) return <AppShell><AccessDenied message="Sign in as a participant to edit." /></AppShell>;
  if (user.role !== 'participant' && user.role !== 'admin') {
    return <AppShell><AccessDenied message="Only participants can edit projects." /></AppShell>;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { detail?: string }).detail || `Save failed (${res.status})`;
        if (isSubmissionsClosedMessage(msg)) {
          setClosed(true);
          setError('Submissions closed for this event.');
        } else {
          setError(msg);
        }
        return;
      }
      router.push(`/projects/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Edit Project</h1>
        {closed && (
          <p className="card border-yellow-300 bg-yellow-50 text-yellow-900 mb-4" role="alert">
            Submissions closed — the server refused the edit (4xx).
          </p>
        )}
        {error && !closed && (
          <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={save} className="card space-y-4">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" value={form.title} onChange={set('title')} required />
          </div>
          <div>
            <label className="label" htmlFor="summary">Summary</label>
            <textarea id="summary" className="input" rows={2} value={form.summary} onChange={set('summary')} />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" className="input" rows={4} value={form.description} onChange={set('description')} />
          </div>
          <div>
            <label className="label" htmlFor="repo_url">Repository URL</label>
            <input id="repo_url" className="input" value={form.repo_url} onChange={set('repo_url')} />
          </div>
          <div>
            <label className="label" htmlFor="demo_url">Demo URL</label>
            <input id="demo_url" className="input" value={form.demo_url} onChange={set('demo_url')} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full py-3">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </main>
    </AppShell>
  );
}
