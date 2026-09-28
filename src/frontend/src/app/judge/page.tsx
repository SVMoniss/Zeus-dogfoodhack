'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';

/** Judge landing: links to scores, assignments, and per-project scoring. */
export default function JudgePage() {
  const { user } = useAuth();
  const allowed = user && (user.role === 'judge' || user.role === 'organizer' || user.role === 'admin');

  return (
    <AppShell>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Judge Workspace</h1>
        <p className="text-gray-600 mb-8">
          You can only read your own scores — the server refuses peer score access (401/403).
        </p>
        {!allowed ? (
          <div className="card" role="alert">
            <h2 className="font-bold text-lg mb-1">Access denied</h2>
            <p className="text-sm text-gray-600 mb-4">Sign in as a judge to score projects.</p>
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <Link href="/judge/scores" className="card hover:shadow-md transition-shadow">
              <h3 className="text-lg font-bold mb-1">My Scores</h3>
              <p className="text-sm text-gray-600">Score table by project/criteria (GET /api/judge/scores).</p>
            </Link>
            <Link href="/judge/assignments" className="card hover:shadow-md transition-shadow">
              <h3 className="text-lg font-bold mb-1">Assignments</h3>
              <p className="text-sm text-gray-600">Projects assigned to you.</p>
            </Link>
            <Link href="/projects" className="card hover:shadow-md transition-shadow">
              <h3 className="text-lg font-bold mb-1">Gallery</h3>
              <p className="text-sm text-gray-600">Browse public projects, then score via /judge/project/[id].</p>
            </Link>
          </div>
        )}
      </main>
    </AppShell>
  );
}
