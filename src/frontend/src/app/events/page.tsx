'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Clock, Users, Trophy } from 'lucide-react';
import { Event } from '@/types';
import { formatDistanceToNow, parseISO } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/events`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
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
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <Trophy className="h-8 w-8 text-primary-600" />
                <span className="text-xl font-bold text-gray-900">DOGFOOD 2026</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="btn-secondary">Sign in</Link>
              <Link href="/register" className="btn-primary">Get Started</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Hackathon Events</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Browse and participate in hackathons. Submit projects, judge submissions, and vote for your favorites.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-500 mb-6">Be the first to create an event!</p>
            <Link href="/register" className="btn-primary">Create Account & Start</Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="card hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    event.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {event.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{event.name}</h3>
                <p className="text-gray-600 mb-4 line-clamp-2">{event.description || 'No description'}</p>
                <div className="space-y-2 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Submissions: {formatDistanceToNow(parseISO(event.submissions_open_at), { addSuffix: true })} → {formatDistanceToNow(parseISO(event.submissions_close_at), { addSuffix: true })}</span>
                  </div>
                  {event.voting_open_at && event.voting_close_at && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Voting: {formatDistanceToNow(parseISO(event.voting_open_at), { addSuffix: true })} → {formatDistanceToNow(parseISO(event.voting_close_at), { addSuffix: true })}</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}