'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { ArrowLeft } from 'lucide-react';
import { Track } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SubmitPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [tracks, setTracks] = useState<Track[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; invite_code: string; member_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    description: '',
    repo_url: '',
    demo_url: '',
    video_url: '',
    track_id: '',
    team_id: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    // Independent fetches: one failing endpoint must not blank the other
    try {
      const tracksRes = await fetch(`${API_URL}/api/events/${slug}/tracks`, { credentials: 'include' });
      if (tracksRes.ok) setTracks(await tracksRes.json());
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
    }
    try {
      const teamsRes = await fetch(`${API_URL}/api/events/${slug}/teams`, { credentials: 'include' });
      if (teamsRes.ok) setTeams(await teamsRes.json());
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.summary.trim()) newErrors.summary = 'Summary is required';
    if (!formData.track_id) newErrors.track_id = 'Track is required';
    if (!formData.team_id) newErrors.team_id = 'Team is required';
    if (formData.repo_url && !formData.repo_url.startsWith('http')) newErrors.repo_url = 'Must be a valid URL';
    if (formData.demo_url && !formData.demo_url.startsWith('http')) newErrors.demo_url = 'Must be a valid URL';
    if (formData.video_url && !formData.video_url.startsWith('http')) newErrors.video_url = 'Must be a valid URL';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create project');
      }

      const project = await res.json();
      window.location.href = `/events/${slug}/projects/${project.id}`;
    } catch (err: any) {
      const message = err.message || 'Failed to create project';
      // Check for submission closed error from API
      if (message.includes('Submissions are closed') || message.includes('closed')) {
        setErrors({ submit: 'Submissions are closed' });
      } else {
        setErrors({ submit: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  if (loading) {
    return (
      <AppShell>
        <p className="py-20 text-center font-mono text-sm text-muted-foreground">Loading form…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-10">
        <Link href={`/events/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to hackathon
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Submit a Project</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a draft project with your team. You can edit until the deadline.</p>
        <div className="card mt-6">

          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
                {errors.submit}
              </div>
            )}

            <div>
              <label htmlFor="title" className="label">Project Title</label>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={formData.title}
                onChange={handleChange}
                className={`input ${errors.title ? 'border-red-500' : ''}`}
                placeholder="My Awesome Project"
              />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            </div>

            <div>
              <label htmlFor="summary" className="label">One-line Summary</label>
              <textarea
                id="summary"
                name="summary"
                rows={2}
                required
                value={formData.summary}
                onChange={handleChange}
                className={`input ${errors.summary ? 'border-red-500' : ''}`}
                placeholder="One line description of your project"
              />
              {errors.summary && <p className="text-red-500 text-sm mt-1">{errors.summary}</p>}
            </div>

            <div>
              <label htmlFor="description" className="label">Description (optional)</label>
              <textarea
                id="description"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="input"
                placeholder="Describe your project in detail..."
              />
            </div>

            <div>
              <label htmlFor="repo_url" className="label">Repository URL (optional)</label>
              <input
                id="repo_url"
                name="repo_url"
                type="url"
                value={formData.repo_url}
                onChange={handleChange}
                className={`input ${errors.repo_url ? 'border-red-500' : ''}`}
                placeholder="https://github.com/..."
              />
              {errors.repo_url && <p className="text-red-500 text-sm mt-1">{errors.repo_url}</p>}
            </div>

            <div>
              <label htmlFor="demo_url" className="label">Demo URL (optional)</label>
              <input
                id="demo_url"
                name="demo_url"
                type="url"
                value={formData.demo_url}
                onChange={handleChange}
                className={`input ${errors.demo_url ? 'border-red-500' : ''}`}
                placeholder="https://demo.example.com"
              />
              {errors.demo_url && <p className="text-red-500 text-sm mt-1">{errors.demo_url}</p>}
            </div>

            <div>
              <label htmlFor="video_url" className="label">Video URL (optional)</label>
              <input
                id="video_url"
                name="video_url"
                type="url"
                value={formData.video_url}
                onChange={handleChange}
                className={`input ${errors.video_url ? 'border-red-500' : ''}`}
                placeholder="https://youtube.com/... or https://vimeo.com/..."
              />
              {errors.video_url && <p className="text-red-500 text-sm mt-1">{errors.video_url}</p>}
            </div>

            <div>
              <label htmlFor="track_id" className="label">Track <span className="text-red-500">*</span></label>
              <select
                id="track_id"
                name="track_id"
                required
                value={formData.track_id}
                onChange={handleChange}
                className={`input ${errors.track_id ? 'border-red-500' : ''}`}
              >
                <option value="">Select a track</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {errors.track_id && <p className="text-red-500 text-sm mt-1">{errors.track_id}</p>}
            </div>

            <div>
              <label htmlFor="team_id" className="label">Team <span className="text-red-500">*</span></label>
              <select
                id="team_id"
                name="team_id"
                required
                value={formData.team_id}
                onChange={handleChange}
                className={`input ${errors.team_id ? 'border-red-500' : ''}`}
              >
                <option value="">Select a team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.invite_code})</option>)}
              </select>
              {errors.team_id && <p className="text-red-500 text-sm mt-1">{errors.team_id}</p>}
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="btn-full w-full"
              >
                {submitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}