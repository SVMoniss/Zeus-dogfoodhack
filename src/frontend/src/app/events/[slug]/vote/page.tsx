'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Ticket, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface BallotProject {
  id: string;
  title: string;
  summary: string | null;
  team: string;
  track: string;
  already_voted: boolean;
}

export default function VotePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<BallotProject[]>([]);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/voting/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not issue ballot token');
      setToken(data.token);
      const bRes = await fetch(`${API_URL}/api/events/${slug}/ballot?token=${data.token}`);
      const ballot = await bRes.json();
      if (!bRes.ok) throw new Error(ballot.detail || 'Could not load ballot');
      setProjects(ballot.projects || []);
      const done: Record<string, boolean> = {};
      (ballot.projects || []).forEach((p: BallotProject) => {
        if (p.already_voted) done[p.id] = true;
      });
      setVoted(done);
    } catch (err: any) {
      setError(err.message || 'Failed to get ballot');
    } finally {
      setLoading(false);
    }
  };

  const castVote = async (projectId: string, score: number) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/voting/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, project_id: projectId, score }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Vote failed');
      setVoted((prev) => ({ ...prev, [projectId]: true }));
    } catch (err: any) {
      setError(err.message || 'Vote failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center">
            <Link href={`/events/${slug}/gallery`} className="text-gray-500 hover:text-gray-700">
              <ArrowRight className="h-5 w-5 rotate-180" />
            </Link>
            <h1 className="ml-4 text-xl font-bold text-gray-900">Community Vote</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!token ? (
          <div className="card max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Ticket className="h-6 w-6" /> Get your ballot
            </h2>
            <p className="text-gray-600 mb-6">Enter your email to receive a one-hour ballot token. One vote per project.</p>
            <form onSubmit={getToken} className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.org"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Issuing...' : 'Email me a ballot'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">Ballot order is randomized per voter. Pick 1–5 stars per project.</p>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            {projects.map((p) => (
              <div key={p.id} className="card">
                <h3 className="text-lg font-bold">{p.title}</h3>
                <p className="text-gray-600 text-sm mb-3">{p.summary} — {p.team} · {p.track}</p>
                {voted[p.id] ? (
                  <p className="text-green-700 text-sm font-medium">Voted ✓</p>
                ) : (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => castVote(p.id, s)}
                        className="btn-secondary flex items-center gap-1"
                        aria-label={`Vote ${s} for ${p.title}`}
                      >
                        <Star className="h-4 w-4" /> {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {projects.length === 0 && <p className="text-gray-500">No projects on this ballot yet.</p>}
          </div>
        )}
      </main>
    </div>
  );
}
