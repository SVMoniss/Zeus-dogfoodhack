'use client';

import Link from 'next/link';
import { Github, Trophy, Users, Code } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2">
                <Trophy className="h-8 w-8 text-primary-600" />
                <span className="text-xl font-bold text-gray-900">DOGFOOD 2026</span>
              </Link>
            </div>
            <div className="flex items-center space-x-8">
              <Link href="/events" className="text-gray-600 hover:text-gray-900 font-medium">
                Events
              </Link>
              <Link href="/login" className="btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <section className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-4xl text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight mb-6">
            Build the Platform{' '}
            <span className="text-primary-600">That Judges You</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            DOGFOOD 2026 is a 72-hour hackathon where you build an open-source, self-hostable
            submission and judging platform. The organizers will fork the winning project
            and run their own events on it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/login" className="btn-primary text-lg px-8 py-3">
              Start Building
            </Link>
            <Link href="https://github.com" target="_blank" rel="noopener noreferrer" className="btn-secondary text-lg px-8 py-3 flex items-center gap-2">
              <Github className="h-5 w-5" />
              View on GitHub
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="card">
              <Code className="h-10 w-10 text-primary-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Full-Stack Platform</h3>
              <p className="text-gray-600">
                Authentication, events, teams, submissions, judging, voting, and more.
                All in one self-hostable package.
              </p>
            </div>
            <div className="card">
              <Trophy className="h-10 w-10 text-primary-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Judging Integrity</h3>
              <p className="text-gray-600">
                Backend-enforced role isolation, weighted rubrics, normalization,
                and audit trails built-in.
              </p>
            </div>
            <div className="card">
              <Users className="h-10 w-10 text-primary-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Community Features</h3>
              <p className="text-gray-600">
                Public voting, comments, embeddable galleries, certificates,
                and REST API with webhooks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white/50 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>DOGFOOD 2026 Hackathon - Build the platform that will judge you.</p>
          <p className="mt-1">Open source under MIT License</p>
        </div>
      </footer>
    </main>
  );
}