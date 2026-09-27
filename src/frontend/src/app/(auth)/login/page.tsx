'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '../lib/auth';
import { Trophy } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user } = useAuth();
  const callbackUrl = searchParams.get('callbackUrl') || '/events';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      
      // Role-based redirect after successful login
      let redirectUrl = callbackUrl;
      if (user?.role === 'organizer') {
        // Find the event slug from the current URL or use a default
        redirectUrl = '/events/sample-hack-2026/organizer/dashboard';
      } else if (user?.role === 'judge') {
        redirectUrl = '/events/sample-hack-2026/judge';
      } else if (user?.role === 'participant') {
        redirectUrl = '/events/sample-hack-2026/team';
      }
      
      router.push(redirectUrl);
      router.refresh();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="flex items-center justify-center space-x-2 mb-8">
            <Trophy className="h-12 w-12 text-primary-600" />
            <span className="text-2xl font-bold text-gray-900">DOGFOOD 2026</span>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900">Sign in to your account</h2>
          <p className="mt-2 text-gray-600">
            Or <Link href="/register" className="text-primary-600 hover:text-primary-500 font-medium">create a new account</Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-500">
          <p>Test accounts:</p>
          <p className="font-mono text-xs">organizer@dogfood.local / testpass123</p>
          <p className="font-mono text-xs">judge_a@dogfood.local / testpass123</p>
          <p className="font-mono text-xs">participant@dogfood.local / testpass123</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}