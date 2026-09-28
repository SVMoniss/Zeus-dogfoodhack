'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { Trophy, Users, AlertCircle } from 'lucide-react';
import { ProjectListItem, Score } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function JudgePage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Array<ProjectListItem & { scores?: Record<string, { score: number; comment?: string }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [myScores, setMyScores] = useState<Record<string, Record<string, { score: number; comment?: string }>>>({});
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      const [projectsRes, scoresRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}/projects`, { credentials: 'include' }),
        fetch(`${API_URL}/api/judge/scores`, { credentials: 'include' }),
      ]);

      if (projectsRes.ok) {
        setProjects(await projectsRes.json());
      } else if (projectsRes.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (scoresRes.ok) {
        const scores = await scoresRes.json();
        const scoresMap: Record<string, Record<string, { score: number; comment?: string }>> = {};
        for (const score of scores) {
          if (!scoresMap[score.project_id]) scoresMap[score.project_id] = {};
          scoresMap[score.project_id][score.criteria_id] = { score: score.score, comment: score.comment };
        }
        setMyScores(scoresMap);
      }
    } catch (err) {
      console.error('Failed to fetch judge data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreSubmit = async (projectId: string, criteriaId: string, score: number, comment: string) => {
    try {
      await fetch(`${API_URL}/api/judge/scores/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scores: [{ criteria_id: criteriaId, score, comment }] }),
      });
      // Refresh scores
      const scoresRes = await fetch(`${API_URL}/api/judge/scores`, { credentials: 'include' });
      if (scoresRes.ok) {
        const scores = await scoresRes.json();
        const scoresMap: Record<string, Record<string, { score: number; comment?: string }>> = {};
        for (const score of scores) {
          if (!scoresMap[score.project_id]) scoresMap[score.project_id] = {};
          scoresMap[score.project_id][score.criteria_id] = { score: score.score, comment: score.comment };
        }
        setMyScores(scoresMap);
      }
    } catch (err) {
      console.error('Failed to submit score:', err);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </AppShell>
    );
  }

  const canJudge = user && ['judge', 'organizer', 'admin'].includes(user.role);
  if (accessDenied || !user || !canJudge) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Insufficient permissions</h2>
            <p className="text-gray-600 mb-4">You don't have access to the judge dashboard.</p>
            <button onClick={() => router.push('/events')} className="btn-primary">Back to Events</button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">My Scores</h2>
          <p className="text-gray-600 mb-4">Review and score your assigned projects.</p>
        </div>

        <div className="space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="card hover:shadow-md transition-shadow p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{project.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.summary || 'No summary'}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {project.team_name}
                    </span>
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs">{project.track_name}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                  <p className="text-sm text-gray-500">Score submission coming soon...</p>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No projects assigned to you yet.</p>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}