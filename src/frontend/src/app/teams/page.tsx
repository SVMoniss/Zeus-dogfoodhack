'use client';

import { useEffect, useState } from 'react';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { API_URL, ApiError, DEFAULT_EVENT_SLUG } from '@/lib/api';

interface Team {
  id: string;
  name: string;
  invite_code: string;
  member_count?: number;
}

interface Member {
  user_email: string;
  user_name: string | null;
}

/** Participant team page: team-aware, backed by /api/events/{slug}/teams. */
export default function TeamsPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [notice, setNotice] = useState('');

  const slug = DEFAULT_EVENT_SLUG;

  const load = async () => {
    try {
      const tRes = await fetch(`${API_URL}/api/events/${slug}/teams`, { credentials: 'include' });
      if (tRes.status === 401 || tRes.status === 403) {
        setDenied(true);
        return;
      }
      if (tRes.ok) {
        const list = await tRes.json();
        setTeams(Array.isArray(list) ? list : []);
      }
      const myRes = await fetch(`${API_URL}/api/events/${slug}/teams/my`, {
        credentials: 'include',
      });
      if (myRes.ok) {
        const mine = await myRes.json();
        setMyTeamId(mine.team?.id || mine.id || null);
        const mRes = await fetch(
          `${API_URL}/api/events/${slug}/teams/${mine.team?.id || mine.id}/members`,
          { credentials: 'include' }
        );
        if (mRes.ok) setMembers(await mRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const post = async (path: string, json?: unknown) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: json ? JSON.stringify(json) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (data as { detail?: string }).detail || `Request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  };

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }

  if (!user) return <AppShell><AccessDenied message="Sign in as a participant to manage teams." /></AppShell>;
  if (denied) return <AppShell><AccessDenied /></AppShell>;

  return (
    <AppShell>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Teams</h1>
        <p className="text-gray-600 mb-6">Only team members can submit — create or join a team first.</p>
        {error && <p className="text-red-600 mb-4" role="alert">{error}</p>}
        {notice && <p className="text-green-700 mb-4">{notice}</p>}

        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-3">My Team</h2>
          {myTeamId ? (
            <>
              <p className="text-sm text-gray-600 mb-2">
                Team ID: <span className="font-mono">{myTeamId}</span>
              </p>
              <ul className="text-sm text-gray-700 list-disc ml-5">
                {members.map((m) => (
                  <li key={m.user_email}>
                    {m.user_name || m.user_email} ({m.user_email})
                  </li>
                ))}
                {members.length === 0 && <li className="list-none text-gray-500">No member details.</li>}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-500">You are not in a team for {slug} yet.</p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <form
            className="card space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setNotice('');
              try {
                await post(`/api/events/${slug}/teams`, { name: teamName });
                setTeamName('');
                setNotice('Team created.');
                await load();
              } catch (err) {
                setNotice(err instanceof Error ? err.message : 'Create failed');
              }
            }}
          >
            <h3 className="font-bold">Create team</h3>
            <input
              className="input"
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
            <button className="btn-primary w-full" type="submit">
              Create
            </button>
          </form>
          <form
            className="card space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setNotice('');
              try {
                await post(`/api/events/${slug}/teams/join-by-code`, { invite_code: inviteCode });
                setInviteCode('');
                setNotice('Joined team.');
                await load();
              } catch (err) {
                setNotice(err instanceof Error ? err.message : 'Join failed');
              }
            }}
          >
            <h3 className="font-bold">Join by invite code</h3>
            <input
              className="input font-mono"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
            <button className="btn-secondary w-full" type="submit">
              Join
            </button>
          </form>
        </div>

        <div className="card mt-6">
          <h3 className="font-bold mb-2">All teams ({teams.length})</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            {teams.slice(0, 20).map((t) => (
              <li key={t.id}>
                {t.name} <span className="font-mono text-gray-500">{t.invite_code}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </AppShell>
  );
}
