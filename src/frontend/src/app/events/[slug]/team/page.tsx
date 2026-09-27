'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Users, Plus, Copy, Check, ArrowRight, LogOut } from 'lucide-react';
import { Team, TeamMember } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function TeamPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/events');
  };

  const [teams, setTeams] = useState<Array<{ id: string; name: string; invite_code: string; max_members: number; members: TeamMember[] }>>([]);
  const [myTeam, setMyTeam] = useState<{ id: string; name: string; invite_code: string; max_members: number; members: TeamMember[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      const [teamsRes, myTeamRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}/teams`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/teams/my`, { credentials: 'include' }),
      ]);

      if (teamsRes.ok) setTeams(await teamsRes.json());
      if (myTeamRes.ok) setMyTeam(await myTeamRes.json());
    } catch (err) {
      console.error('Failed to fetch team data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      setErrors({ name: 'Team name is required' });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newTeamName }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create team');
      }

      const team = await res.json();
      setNewTeamName('');
      fetchData();
    } catch (err: any) {
      setErrors({ create: err.message || 'Failed to create team' });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setErrors({ invite: 'Invite code is required' });
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`${API_URL}/api/teams/${inviteCode}/join`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to join team');
      }

      setInviteCode('');
      fetchData();
    } catch (err: any) {
      setErrors({ join: err.message || 'Failed to join team' });
    } finally {
      setJoining(false);
    }
  };

  const copyInviteCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    // Could add a toast notification here
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/events" className="text-gray-500 hover:text-gray-700">
                <ArrowRight className="h-5 w-5 rotate-180" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Team Management</h1>
                <p className="text-sm text-gray-500">Create or join a team to submit projects</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Team Management</h2>
          <p className="text-gray-600 mb-6">Create or join a team to submit projects.</p>
        </div>

        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Your Team</h2>
          {myTeam ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{myTeam.name}</h3>
                  <p className="text-sm text-gray-500">
                    Invite Code: <span className="font-mono text-primary-600">{myTeam.invite_code}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(myTeam.invite_code)}
                      className="ml-2 text-primary-600 hover:text-primary-700 text-sm"
                    >
                      <Copy className="h-4 w-4 inline" />
                    </button>
                  </p>
                </div>
                <p className="text-sm text-gray-500">
                  Members: {myTeam.members.length}/{myTeam.max_members}
                </p>
              </div>
              <div className="space-y-2">
                {myTeam.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
<p className="font-medium">{member.user_name || member.user_email}</p>
                      <p className="text-sm text-gray-500">{member.user_email}</p>
                      </div>
                    </div>
                    {member.user_id === user?.id && (
                      <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">You</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4">You don't have a team yet. Create one or join an existing team.</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Create New Team</h2>
          </div>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            {errors.create && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
                {errors.create}
              </div>
            )}
            <div>
              <label htmlFor="team_name" className="label">Team Name</label>
              <input
                id="team_name"
                name="name"
                type="text"
                required
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="input"
                placeholder="My Awesome Team"
              />
            </div>
            <div>
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Join Existing Team</h2>
          <p className="text-gray-600 mb-4">Enter an invite code to join a team.</p>
          <form onSubmit={handleJoinTeam} className="space-y-4">
            {errors.join && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
                {errors.join}
              </div>
            )}
            <div>
              <label htmlFor="invite_code" className="label">Invite Code</label>
              <input
                id="invite_code"
                name="invite_code"
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="input"
                placeholder="ABCD1234"
                maxLength={8}
              />
            </div>
            <div>
              <button type="submit" disabled={joining} className="btn-primary w-full py-3">
                {joining ? 'Joining...' : 'Join Team'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">All Teams</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="pb-3 px-4">Team Name</th>
                  <th className="pb-3 px-4">Members</th>
                  <th className="pb-3 px-4">Invite Code</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{team.name}</td>
                    <td className="py-3 px-4 text-gray-600">{team.members?.length || 0}/{team.max_members}</td>
                    <td className="py-3 px-4 font-mono text-sm text-primary-600">{team.invite_code}</td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-500">No teams created yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}