'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { ArrowRight, Key, Webhook, Award, Package, AlertCircle, LogOut } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function IntegrationsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { user, logout } = useAuth();

  const [keys, setKeys] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [keyName, setKeyName] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [certTitle, setCertTitle] = useState('');
  const [certEmail, setCertEmail] = useState('');
  const [certResult, setCertResult] = useState<any>(null);
  const [importJson, setImportJson] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const refresh = async () => {
    try {
      const [k, h, j] = await Promise.all([
        fetch(`${API_URL}/api/events/${slug}/api-keys`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/webhooks`, { credentials: 'include' }),
        fetch(`${API_URL}/api/events/${slug}/bulk/jobs`, { credentials: 'include' }),
      ]);
      if (k.ok) setKeys(await k.json());
      if (h.ok) setHooks(await h.json());
      if (j.ok) setJobs(await j.json());
    } catch {
      /* organizer-only lists; errors surface per action */
    }
  };

  if (user && user.role !== 'organizer' && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Insufficient permissions</h2>
          <button onClick={() => router.push('/events')} className="btn-primary">Back to Events</button>
        </div>
      </div>
    );
  }

  const createKey = async () => {
    setNewSecret('');
    const res = await fetch(`${API_URL}/api/events/${slug}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: keyName || 'default', permissions: ['read'] }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewSecret(data.key);
      setKeyName('');
      refresh();
    } else setNotice(data.detail || 'Key creation failed');
  };

  const revokeKey = async (id: string) => {
    await fetch(`${API_URL}/api/events/${slug}/api-keys/${id}`, { method: 'DELETE', credentials: 'include' });
    refresh();
  };

  const createHook = async () => {
    const res = await fetch(`${API_URL}/api/events/${slug}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url: hookUrl, events: ['project.submitted', 'score.submitted'] }),
    });
    const data = await res.json();
    if (res.ok) {
      setHookUrl('');
      refresh();
    } else setNotice(data.detail || 'Webhook creation failed');
  };

  const deleteHook = async (id: string) => {
    await fetch(`${API_URL}/api/events/${slug}/webhooks/${id}`, { method: 'DELETE', credentials: 'include' });
    refresh();
  };

  const generateCert = async () => {
    // Demo shortcut: certificate for the signed-in organizer by email lookup is
    // out of scope here; organizer pastes the recipient user UUID.
    const res = await fetch(`${API_URL}/api/events/${slug}/certificates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        recipient_type: 'user',
        recipient_id: certEmail,
        certificate_type: 'participation',
        title: certTitle || 'Participation',
      }),
    });
    const data = await res.json();
    if (res.ok) setCertResult(data);
    else setNotice(data.detail || 'Certificate failed (recipient must be a user UUID)');
  };

  const runImport = async () => {
    try {
      const payload = JSON.parse(importJson);
      const res = await fetch(`${API_URL}/api/events/${slug}/bulk/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      setImportResult(await res.json());
      refresh();
    } catch {
      setNotice('Import body must be valid JSON: {"projects": [{"title": ..., "team": ...}]}');
    }
  };

  const downloadExport = async () => {
    const res = await fetch(`${API_URL}/api/events/${slug}/bulk/export`, { credentials: 'include' });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-export.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link href="/events" className="text-gray-500 hover:text-gray-700">
                <ArrowRight className="h-5 w-5 rotate-180" />
              </Link>
              <h1 className="ml-4 text-xl font-bold text-gray-900">Integrations & Records</h1>
            </div>
            <button onClick={async () => { await logout(); router.push('/events'); }} className="btn-secondary flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {notice && <p className="text-red-500 text-sm">{notice}</p>}

        <div className="card">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Key className="h-5 w-5" /> API keys</h2>
          <p className="text-gray-600 text-sm mb-4">Keys authenticate the public REST API (<code>/api/v1/…</code>, docs at <code>/docs</code>). Secrets show once.</p>
          <div className="flex gap-2 mb-4">
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} className="input" placeholder="Key name" />
            <button onClick={createKey} className="btn-primary">Create</button>
          </div>
          {newSecret && <p className="text-sm mb-4 break-all">New secret (copy now): <code className="bg-gray-100 px-2 py-1 rounded">{newSecret}</code></p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between border-t border-gray-100 py-2 text-sm">
              <span>{k.name} <code className="text-gray-500">{k.key_prefix}…</code></span>
              <button onClick={() => revokeKey(k.id)} className="btn-secondary">Revoke</button>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks</h2>
          <p className="text-gray-600 text-sm mb-4">HMAC-signed POSTs on <code>project.submitted</code> and <code>score.submitted</code>, 3 delivery attempts.</p>
          <div className="flex gap-2 mb-4">
            <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} className="input" placeholder="https://…" />
            <button onClick={createHook} className="btn-primary">Add</button>
          </div>
          {hooks.map((h) => (
            <div key={h.id} className="flex items-center justify-between border-t border-gray-100 py-2 text-sm">
              <span className="break-all">{h.url}</span>
              <button onClick={() => deleteHook(h.id)} className="btn-secondary">Delete</button>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Award className="h-5 w-5" /> Certificates</h2>
          <p className="text-gray-600 text-sm mb-4">Ed25519-signed records, publicly verifiable.</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <input value={certTitle} onChange={(e) => setCertTitle(e.target.value)} className="input" placeholder="Title" />
            <input value={certEmail} onChange={(e) => setCertEmail(e.target.value)} className="input" placeholder="Recipient user UUID" />
          </div>
          <button onClick={generateCert} className="btn-primary mb-4">Generate</button>
          {certResult && (
            <p className="text-sm break-all">Issued <code>{certResult.id}</code> —{' '}
              <Link href={`/certificates/verify?id=${certResult.id}`} className="text-primary-600 underline">verify publicly</Link>
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Package className="h-5 w-5" /> Bulk import / export</h2>
          <div className="flex gap-2 mb-4">
            <button onClick={downloadExport} className="btn-primary">Download full JSON export</button>
          </div>
          <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={4} className="input mb-2" placeholder='{"projects": [{"title": "X", "team": "Y", "track": "General"}]}' />
          <button onClick={runImport} className="btn-secondary">Run import</button>
          {importResult && (
            <p className="text-sm mt-2">Processed {importResult.records_processed}/{importResult.records_total}, failed {importResult.records_failed}.</p>
          )}
          {jobs.length > 0 && <p className="text-sm text-gray-500 mt-2">{jobs.length} bulk job(s) on record.</p>}
        </div>
      </main>
    </div>
  );
}
