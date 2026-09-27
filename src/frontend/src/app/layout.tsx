import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './(auth)/lib/auth';

export const metadata: Metadata = {
  title: 'DOGFOOD 2026 - Hackathon Platform',
  description: 'Submission and judging platform for hackathons',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}