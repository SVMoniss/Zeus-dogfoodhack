'use client';

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ArrowRight, Users, ClipboardCheck, BarChart2, AlertCircle, Loader2, LogOut } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ProgressDashboard {
  total_projects: number;
  judged_projects: number;
  pending_projects: number;
  total_judges: number;
  judges_completed: number;
  by_track: Record<string, { total: number; judged: number; pending: number }>;
  by_judge: Record<string, { name: string; track: string; total: number; completed: number }>;
}

export default function OrganizerDashboardPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/events');
  };

  const [dashboard, setDashboard] = useState<ProgressDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Array<{ id: string; name: string }>>([]);
  const [criteria, setCriteria] = useState<Array<{ id: string; name: string; weight: number }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [assignTrackId, setAssignTrackId] = useState('');
  const [critName, setCritName] = useState('');
  const [critWeight, setCritWeight] = useState('20');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchDashboard();
    fetchManage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchManage = async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/criteria`, { credentials: 'include' }),
      ]);
      if (tRes.ok) setTracks(await tRes.json());
      if (cRes.ok) setCriteria(await cRes.json());
    } catch {
      /* management lists are best-effort */
    }
  };

  const inviteAndAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    try {
      const iRes = await fetch(`${API_URL}/api/events/${slug}/judges/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const invited = await iRes.json();
      if (!iRes.ok) throw new Error(invited.detail || 'Invite failed');
      if (assignTrackId) {
        const aRes = await fetch(`${API_URL}/api/events/${slug}/judges/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ judge_id: invited.judge_id, track_id: assignTrackId }),
        });
        const assigned = await aRes.json();
        if (!aRes.ok) throw new Error(assigned.detail || 'Assign failed');
      }
      setInviteEmail('');
      fetchDashboard();
      setNotice('Judge invited' + (assignTrackId ? ' and assigned.' : '.'));
    } catch (err: any) {
      setNotice(err.message || 'Invite failed');
    }
  };

  const addCriteria = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/criteria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: critName.trim(), weight: Number(critWeight) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Criteria creation failed');
      setCritName('');
      fetchManage();
      setNotice('Rubric criteria added.');
    } catch (err: any) {
      setNotice(err.message || 'Criteria creation failed');
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/judging/progress`, {
        credentials: 'include',
      });

      if (res.status === 403 || res.status === 401) {
        setAccessDenied(true);
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch dashboard');
      }

      setDashboard(await res.json());
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-600" />
      </div>
    );
  }

  if (accessDenied || !user || user.role !== 'organizer') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Insufficient permissions</h2>
          <p className="text-gray-600 mb-4">Only organizers can view the dashboard.</p>
          <button onClick={() => router.push('/events')} className="btn-primary">Back to Events</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchDashboard} className="btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">No dashboard data available.</p>
        </div>
      </div>
    );
  }

  const progressPercent = dashboard.total_projects > 0 
    ? Math.round((dashboard.judged_projects / dashboard.total_projects) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => router.push('/events')} className="text-gray-500 hover:text-gray-700">
                <ArrowRight className="h-5 w-5 rotate-180" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Organizer Dashboard</h1>
                <p className="text-sm text-gray-500">{slug}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={() => router.push(`/events/${slug}/organizer/integrations`)} className="btn-secondary">
                Integrations
              </button>
              <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Projects</p>
                <p className="text-3xl font-bold text-gray-900">{dashboard.total_projects}</p>
              </div>
              <ClipboardCheck className="h-12 w-12 text-primary-600" />
            </div>
            <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-600 transition-all duration-300" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">{progressPercent}% judged</p>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Judged</p>
                <p className="text-3xl font-bold text-green-600">{dashboard.judged_projects}</p>
              </div>
              <Users className="h-12 w-12 text-green-600" />
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">{dashboard.pending_projects}</p>
              </div>
              <BarChart2 className="h-12 w-12 text-yellow-600" />
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Judges</p>
                <p className="text-3xl font-bold text-purple-600">
                  {dashboard.judges_completed} / {dashboard.total_judges}
                </p>
              </div>
              <Users className="h-12 w-12 text-purple-600" />
            </div>
          </div>
        </div>

        {/* By Track */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Progress by Track</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="pb-3 px-4">Track</th>
                  <th className="pb-3 px-4">Total</th>
                  <th className="pb-3 px-4">Judged</th>
                  <th className="pb-3 px-4">Pending</th>
                  <th className="pb-3 px-4">Progress</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboard.by_track).map(([track, data]) => {
                  const trackPercent = data.total > 0 ? Math.round((data.judged / data.total) * 100) : 0;
                  return (
                    <tr key={track} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{track}</td>
                      <td className="py-3 px-4 text-gray-600">{data.total}</td>
                      <td className="py-3 px-4 text-green-600 font-medium">{data.judged}</td>
                      <td className="py-3 px-4 text-yellow-600">{data.pending}</td>
                      <td className="py-3 px-4">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-600 transition-all duration-300" 
                            style={{ width: `${trackPercent}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{trackPercent}%</p>
                      </td>
                    </tr>
                  );
                })}
                {Object.keys(dashboard.by_track).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">No tracks configured.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Judges & Rubric */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Judges & Rubric</h2>
          {notice && <p className="text-sm text-gray-600 mb-4">{notice}</p>}
          <form onSubmit={inviteAndAssign} className="grid md:grid-cols-3 gap-3 mb-6">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="input"
              placeholder="judge@example.org"
            />
            <select value={assignTrackId} onChange={(e) => setAssignTrackId(e.target.value)} className="input">
              <option value="">No track assignment</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="submit" className="btn-primary">Invite & Assign</button>
          </form>
          <form onSubmit={addCriteria} className="grid md:grid-cols-3 gap-3 mb-4">
            <input
              value={critName}
              onChange={(e) => setCritName(e.target.value)}
              className="input"
              placeholder="Criteria name"
              required
            />
            <input
              type="number"
              min={0}
              max={100}
              value={critWeight}
              onChange={(e) => setCritWeight(e.target.value)}
              className="input"
              placeholder="Weight %"
              required
            />
            <button type="submit" className="btn-secondary">Add Criteria</button>
          </form>
          <p className="text-sm text-gray-500">
            Rubric: {criteria.length === 0 ? 'none yet' : criteria.map((c) => `${c.name} ${c.weight}%`).join(' · ')}
          </p>
        </div>

        {/* By Judge */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Progress by Judge</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="pb-3 px-4">Judge</th>
                  <th className="pb-3 px-4">Track</th>
                  <th className="pb-3 px-4">Completed Scores</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboard.by_judge).map(([judgeId, data]) => (
                  <tr key={judgeId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{data.name}</td>
                    <td className="py-3 px-4 text-gray-600">{data.track}</td>
                    <td className="py-3 px-4 text-primary-600 font-medium">{data.completed}</td>
                  </tr>
                ))}
                {Object.keys(dashboard.by_judge).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-500">No judges assigned yet.</td>
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