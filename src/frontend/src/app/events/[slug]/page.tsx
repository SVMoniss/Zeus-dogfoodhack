'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Calendar, Clock, Users, Trophy, Code, ExternalLink, ArrowRight } from 'lucide-react';
import { Event, ProjectListItem, Track } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function EventDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'gallery' | 'submit' | 'team' | 'judge'>('overview');

  useEffect(() => {
    fetchEvent();
  }, [slug]);

  const fetchEvent = async () => {
    try {
      const [eventRes, tracksRes, projectsRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/projects`, { credentials: 'include' }),
      ]);

      if (eventRes.ok) setEvent(await eventRes.json());
      if (tracksRes.ok) setTracks(await tracksRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
    } catch (err) {
      console.error('Failed to fetch event:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Event not found</h2>
          <Link href="/events" className="btn-primary mt-4 inline-block">Back to Events</Link>
        </div>
      </div>
    );
  }

  const isOrganizer = user?.role === 'organizer' || user?.role === 'admin';
  const isJudge = user?.role === 'judge' || user?.role === 'organizer' || user?.role === 'admin';
  const isParticipant = user?.role === 'participant' || user?.role === 'judge' || user?.role === 'organizer' || user?.role === 'admin';

  const tabs: { id: 'overview' | 'gallery' | 'submit' | 'team' | 'judge'; label: string; icon: typeof Trophy }[] = [
    { id: 'overview', label: 'Overview', icon: Trophy },
    { id: 'gallery', label: 'Gallery', icon: Code },
  ];

  if (isParticipant) tabs.push({ id: 'submit', label: 'Submit', icon: ExternalLink }, { id: 'team', label: 'Team', icon: Users });
  if (isJudge) tabs.push({ id: 'judge', label: 'Judge', icon: Trophy });

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
                <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
                <p className="text-sm text-gray-500">{event.slug}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {user ? (
                <>
                  <span className="text-sm text-gray-600">{user.email}</span>
                  <button onClick={async () => {
                    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                    window.location.reload();
                  }} className="btn-secondary text-sm">Logout</button>
                </>
              ) : (
                <Link href="/login" className="btn-primary text-sm">Sign in</Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <nav className="mb-8" aria-label="Event sections">
          <div className="border-b border-gray-200">
            <ul className="flex flex-wrap -mb-px space-x-8" role="tablist">
              {tabs.map((tab) => (
                <li key={tab.id} role="presentation">
                  <button
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Event Details</h3>
              <p className="text-gray-600 mb-6">{event.description || 'No description provided.'}</p>
              <dl className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <dt className="text-gray-500">Submissions Open</dt>
                    <dd className="font-medium">{formatDistanceToNow(parseISO(event.submissions_open_at), { addSuffix: true })}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <dt className="text-gray-500">Submissions Close</dt>
                    <dd className="font-medium text-red-600">{formatDistanceToNow(parseISO(event.submissions_close_at), { addSuffix: true })}</dd>
                  </div>
                </div>
                {event.voting_open_at && event.voting_close_at && (
                  <>
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <dt className="text-gray-500">Voting Open</dt>
                        <dd className="font-medium">{formatDistanceToNow(parseISO(event.voting_open_at), { addSuffix: true })}</dd>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <dt className="text-gray-500">Voting Close</dt>
                        <dd className="font-medium">{formatDistanceToNow(parseISO(event.voting_close_at), { addSuffix: true })}</dd>
                      </div>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Tracks</h3>
              <ul className="space-y-2">
                {tracks.map((track) => (
                  <li key={track.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="font-medium">{track.name}</span>
                    <span className="text-sm text-gray-500">{track.description || 'No description'}</span>
                  </li>
                ))}
                {tracks.length === 0 && <p className="text-gray-500">No tracks defined yet.</p>}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'gallery' && (
          <div>
            <div className="mb-6 flex flex-wrap gap-4">
              <input
                type="text"
                placeholder="Search projects..."
                className="input flex-1 max-w-md"
              />
              <select className="input w-auto">
                <option value="">All Tracks</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/events/${slug}/projects/${project.id}`} className="card hover:shadow-md transition-shadow">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{project.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.summary || 'No summary'}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {project.team_name}
                    </span>
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs">{project.track_name}</span>
                  </div>
                  {project.repo_url && (
                    <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm">
                      <ExternalLink className="h-3 w-3" />
                      View Repository
                    </a>
                  )}
                </Link>
              ))}
              {projects.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Code className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No projects submitted yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'submit' && (
          <div className="max-w-2xl mx-auto">
            <div className="card">
              <h2 className="text-2xl font-bold mb-6">Submit a Project</h2>
              <p className="text-gray-600 mb-6">Create a draft project with your team. You can edit until the deadline.</p>
              <Link href={`/events/${slug}/submit`} className="btn-primary inline-block">
                Create New Project
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="max-w-2xl mx-auto">
            <div className="card">
              <h2 className="text-2xl font-bold mb-6">Team Management</h2>
              <p className="text-gray-600 mb-6">Create or join a team to submit projects.</p>
              <Link href={`/events/${slug}/team`} className="btn-primary inline-block">
                Manage Team
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'judge' && (
          <div className="max-w-4xl mx-auto">
            <div className="card">
              <h2 className="text-2xl font-bold mb-6">Judge Dashboard</h2>
              <p className="text-gray-600 mb-6">View and score your assigned projects.</p>
              <Link href={`/events/${slug}/judge`} className="btn-primary inline-block">
                Go to Judge Dashboard
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}