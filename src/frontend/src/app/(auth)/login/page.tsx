'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { BrandLockup } from '@/components/Brand';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
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

      // Spec requirement: after sign-in the user lands on the events
      // listing (default callbackUrl), regardless of role. Role
      // dashboards remain reachable via direct navigation.
      router.push(callbackUrl);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="mb-8 flex items-center justify-center" aria-label="DOGFOOD 2026 home">
            <BrandLockup markSize={44} textClassName="text-2xl text-gray-900" />
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
  return <LoginForm />;
}