'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BrandLockup } from '@/components/Brand';

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="badge" data-testid="role-badge">
      {role}
    </span>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
    router.refresh();
  };

  const link = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`text-sm font-medium transition-colors hover:text-foreground ${active ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link href="/" className="text-foreground" aria-label="DOGFOOD 2026 home">
            <BrandLockup markSize={26} />
          </Link>
          <nav
            className="flex flex-wrap items-center gap-5"
            aria-label="Main navigation"
          >
            {link('/projects', 'Projects')}
            {link('/events', 'Events')}
            {link('/events/sample-hack-2026/vote', 'Vote')}
            {!user && link('/login', 'Sign in')}
            {user?.role === 'participant' && link('/dashboard', 'Dashboard')}
            {user?.role === 'participant' && link('/teams', 'Teams')}
            {user?.role === 'judge' && link('/judge/scores', 'Scoring')}
            {user?.role === 'judge' && link('/judge/assignments', 'Judging')}
            {(user?.role === 'organizer' || user?.role === 'admin') &&
              link('/organizer/dashboard', 'Organizers')}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <RoleBadge role={user.role} />
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline max-w-48 truncate">
                  {user.email}
                </span>
                <button onClick={handleLogout} className="btn-outline text-sm h-8 px-3">
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </span>
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-primary text-sm h-8 px-3">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1">
        <main className="mx-auto max-w-6xl px-5">{children}</main>
      </div>
    </div>
  );
}

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-20" role="alert">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Access denied</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          {message || 'You do not have permission to view this page. The server refused the request (401/403).'}
        </p>
        <Link href="/login" className="btn-primary">
          Sign in
        </Link>
      </div>
    </div>
  );
}
