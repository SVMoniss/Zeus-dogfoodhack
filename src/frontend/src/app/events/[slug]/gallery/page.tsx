'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Calendar, Clock, Users, Trophy, Code, ExternalLink, ArrowRight, Search, Filter, LogOut } from 'lucide-react';
import { Event, ProjectListItem, Track } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function GalleryPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/events');
  };

  const [event, setEvent] = useState<Event | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

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

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.summary || '').toLowerCase().includes(search.toLowerCase());
    const matchesTrack = !trackFilter || p.track_name === trackFilter;
    return matchesSearch && matchesTrack;
  });

  if (loading) {
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
            <div className="flex items-center space-x-4">
              <Link href={`/events/${slug}/vote`} className="btn-primary">Community Vote</Link>
              {user && (
                <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search projects..."
            className="input flex-1 max-w-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input w-auto" value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
            <option value="">All Tracks</option>
            {tracks.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
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
          {filteredProjects.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Code className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No projects found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}