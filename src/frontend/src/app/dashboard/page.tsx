'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AppShell, { AccessDenied } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';

/**
 * Role-based dashboard:
 * participant => participant screen, judge => judge screen,
 * organizer/admin => organizer screen, guest => landing/login prompt.
 */
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'judge') router.replace('/judge');
      else if (user.role === 'organizer' || user.role === 'admin') router.replace('/organizer');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Welcome to DOGFOOD 2026</h1>
          <p className="text-gray-600 mb-6">Sign in to see your dashboard.</p>
          <Link href="/login" className="btn-primary">
            Sign in
          </Link>
        </main>
      </AppShell>
    );
  }

  if (user.role === 'judge' || user.role === 'organizer' || user.role === 'admin') {
    return (
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-600">Redirecting to your dashboard…</p>
        </main>
      </AppShell>
    );
  }

  if (user.role !== 'participant') {
    return (
      <AppShell>
        <AccessDenied message="Unknown role. Please contact an organizer." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Participant Dashboard</h1>
        <p className="text-gray-600 mb-8">Manage your team and submissions.</p>
        <div className="grid gap-6 md:grid-cols-3">
          <Link href="/teams" className="card hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-1">My Team</h3>
            <p className="text-sm text-gray-600">View invite code, members, join or leave.</p>
          </Link>
          <Link href="/projects/new" className="card hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-1">New Submission</h3>
            <p className="text-sm text-gray-600">Submit a project (blocked when event is closed).</p>
          </Link>
          <Link href="/projects" className="card hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-1">Gallery</h3>
            <p className="text-sm text-gray-600">Browse all public projects.</p>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
