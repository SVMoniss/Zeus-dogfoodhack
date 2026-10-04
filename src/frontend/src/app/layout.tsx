import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { TrophyMark } from '@/components/Brand';

export const metadata: Metadata = {
  title: 'DOGFOOD 2026 - Hackathon Platform',
  description: 'Submission and judging platform for hackathons',
  openGraph: {
    title: 'DOGFOOD 2026 — self-hosted hackathon judging',
    description:
      'Submissions, balanced judge assignment and score normalization in one self-hostable app.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground font-sans min-h-screen flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <footer className="border-t border-border py-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 font-mono text-xs text-muted-foreground">
            <TrophyMark size={20} />
            <span>DOGFOOD 2026 — self-hostable hackathon judging. Run it yourself with Docker Compose.</span>
            <a href="/blog" className="ml-auto font-sans font-medium text-primary hover:underline underline-offset-4">
              DOGFOOD Blog
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}