'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, DEFAULT_EVENT_SLUG } from '@/lib/api';

interface Criteria {
  id: string;
  name: string;
  weight: number;
  min_score: number;
  max_score: number;
}

interface Score {
  criteria_id: string;
  score: number;
  comment: string | null;
}

/** Per-project scoring: loads project + rubric + own scores, POSTs a raw score array. */
export default function JudgeProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState(DEFAULT_EVENT_SLUG);
  // Deep-link support: ?event=<slug> targets a specific event (fixture event by default).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('event');
    if (q) setSlug(q);
  }, []);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [inputs, setInputs] = useState<Record<string, { score: string; comment: string }>>({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (authLoading) return;
    // Only the latest slug's responses win (slug switches once for ?event=).
    let cancelled = false;
    const load = async () => {
      try {
        const [pRes, cRes, sRes] = await Promise.all([
          fetch(`${API_URL}/api/events/${slug}/projects/${id}`, { credentials: 'include' }),
          fetch(`${API_URL}/api/events/${slug}/criteria`, { credentials: 'include' }),
          fetch(`${API_URL}/api/judge/scores`, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (sRes.status === 401 || sRes.status === 403) {
          setDenied(true);
          return;
        }
        if (pRes.ok) {
          const p = await pRes.json();
          setTitle(p.title);
          setSummary(p.summary || '');
        }
        if (cRes.ok) setCriteria(await cRes.json());
        if (sRes.ok) {
          const mine: Score[] = (await sRes.json()).filter(
            (s: Score & { project_id: string }) => (s as unknown as { project_id: string }).project_id === id
          );
          const next: Record<string, { score: string; comment: string }> = {};
          for (const s of mine) next[s.criteria_id] = { score: String(s.score), comment: s.comment || '' };
          setInputs(next);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, id, slug]);

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
        <AccessDenied message="Only judges can score projects." />
      </AppShell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    const body = criteria.map((c) => ({
      criteria_id: c.id,
      score: Number(inputs[c.id]?.score),
      comment: inputs[c.id]?.comment || null,
    }));
    const res = await fetch(`${API_URL}/api/judge/scores/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice((data as { detail?: string }).detail || `Score rejected (${res.status})`);
      return;
    }
    setNotice('Scores saved.');
    router.refresh();
  };

  return (
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/judge/assignments" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to assignments
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-1">{title || 'Project'}</h1>
        <p className="text-gray-600 mb-6">{summary}</p>
        {notice && <p className="card mb-4 text-sm">{notice}</p>}
        {criteria.length === 0 ? (
          <p className="text-gray-500">No rubric criteria configured for this event yet.</p>
        ) : (
          <form onSubmit={submit} className="card space-y-5">
            {criteria.map((c) => (
              <div key={c.id}>
                <label className="label" htmlFor={`score-${c.id}`}>
                  {c.name} (weight {c.weight}%, {c.min_score}–{c.max_score})
                </label>
                <input
                  id={`score-${c.id}`}
                  type="number"
                  min={c.min_score}
                  max={c.max_score}
                  required
                  className="input"
                  value={inputs[c.id]?.score || ''}
                  onChange={(e) => setInputs((m) => ({ ...m, [c.id]: { score: e.target.value, comment: m[c.id]?.comment || '' } }))}
                />
                <input
                  className="input mt-2"
                  placeholder="Comment (optional)"
                  value={inputs[c.id]?.comment || ''}
                  onChange={(e) => setInputs((m) => ({ ...m, [c.id]: { score: m[c.id]?.score || '', comment: e.target.value } }))}
                />
              </div>
            ))}
            <button type="submit" className="btn-primary w-full py-3">
              Save Scores
            </button>
          </form>
        )}
      </main>
    </AppShell>
  );
}
