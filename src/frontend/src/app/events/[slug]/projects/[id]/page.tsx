'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Users, MessageSquare } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Project } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Comment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id]);

  const fetchAll = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}/projects/${id}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/projects/${id}/comments`, { credentials: 'include' }),
      ]);
      if (pRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (pRes.ok) setProject(await pRes.json());
      if (cRes.ok) setComments(await cRes.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/events/${slug}/projects/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: content.trim(),
          author_name: name.trim() || undefined,
          author_email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to post comment');
      setContent('');
      setNotice(data.is_approved ? 'Comment posted.' : 'Comment posted and awaiting moderation.');
      const cRes = await fetch(`${API_URL}/api/events/${slug}/projects/${id}/comments`, { credentials: 'include' });
      if (cRes.ok) setComments(await cRes.json());
    } catch (err: any) {
      setNotice(err.message || 'Failed to post comment');
    } finally {
      setPosting(false);
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

  if (notFound || !project) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Project not found</h2>
            <Link href={`/events/${slug}/gallery`} className="btn-primary mt-4 inline-block">Back to Gallery</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex h-16 items-center">
          <Link href={`/events/${slug}/gallery`} className="text-gray-500 hover:text-gray-700">
            <ArrowRight className="h-5 w-5 rotate-180" />
          </Link>
          <h1 className="ml-4 text-xl font-bold text-gray-900">{project.title}</h1>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Users className="h-4 w-4" />
            <span>{project.team_name || 'Independent'}</span>
            {project.track_name && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs">{project.track_name}</span>
            )}
          </div>
          <p className="text-gray-700 mb-4">{project.summary}</p>
          {project.description && <p className="text-gray-600 whitespace-pre-wrap mb-4">{project.description}</p>}
          <div className="flex flex-wrap gap-3">
            {project.repo_url && <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Repository</a>}
            {project.demo_url && <a href={project.demo_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Live Demo</a>}
            <Link href={`/events/${slug}/vote`} className="btn-primary">Vote for this project</Link>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Comments ({comments.length})
          </h2>
          <div className="space-y-3 mb-6">
            {comments.map((c) => (
              <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">{c.author_name}</p>
                <p className="text-gray-700">{c.content}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-gray-500 text-sm">No comments yet. Be the first!</p>}
          </div>
          <form onSubmit={postComment} className="space-y-3">
            <textarea
              name="content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input"
              placeholder="Share feedback... (signed in users post directly, guests leave a name and email)"
            />
            <div className="grid grid-cols-2 gap-3">
              <input name="author_name" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Name (guests)" />
              <input name="author_email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Email (guests)" />
            </div>
            {notice && <p className="text-sm text-gray-600">{notice}</p>}
            <button type="submit" disabled={posting} className="btn-primary">
              {posting ? 'Posting...' : 'Post Comment'}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
