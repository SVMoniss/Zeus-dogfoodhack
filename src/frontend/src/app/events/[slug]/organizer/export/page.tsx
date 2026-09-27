'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ArrowRight, Download, AlertCircle, LogOut } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function OrganizerExportPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/events');
  };

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkAccessAndExport();
  }, [slug]);

  const checkAccessAndExport = async () => {
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/export.csv`, {
        credentials: 'include',
      });

      if (res.status === 403 || res.status === 401) {
        setAccessDenied(true);
        return;
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event_${slug}_results.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export failed:', err);
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

  if (accessDenied || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Insufficient permissions</h2>
          <p className="text-gray-600 mb-4">Only organizers can export CSV data.</p>
          <button onClick={() => router.push('/events')} className="btn-primary">Back to Events</button>
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
              <button onClick={() => router.push('/events')} className="text-gray-500 hover:text-gray-700">
                <ArrowRight className="h-5 w-5 rotate-180" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Export Results</h1>
                <p className="text-sm text-gray-500">{slug}</p>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
        <div className="text-center">
          <Download className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Export Complete</h2>
          <p className="text-gray-600 mb-4">CSV file has been downloaded.</p>
          <button onClick={() => router.push('/events')} className="btn-primary">Back to Events</button>
        </div>
      </main>
    </div>
  );
}