import { test, expect } from '@playwright/test';

// Non-functional: response budgets, concurrency, resilience to dead
// dependencies, auth boundaries, malformed input (never 500).

const API = 'http://localhost:8000';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

test.describe('NFR response budgets', () => {
  test('key reads stay within budget', async ({ request }) => {
    const judge = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');
    const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');

    let t = await timed(() =>
      request.get(`${API}/api/events/sample-hack-2026/projects`),
    );
    expect(t.result.ok()).toBeTruthy();
    expect(t.ms).toBeLessThan(2000);

    t = await timed(() =>
      request.get(`${API}/api/judge/scores`, { headers: auth(judge) }),
    );
    expect(t.result.ok()).toBeTruthy();
    expect(t.ms).toBeLessThan(2000);

    t = await timed(() =>
      request.get(`${API}/api/events/sample-hack-2026/export.csv`, { headers: auth(org) }),
    );
    expect(t.result.ok()).toBeTruthy();
    expect(t.ms).toBeLessThan(5000);
  });

  test('gallery survives a 20-way burst', async ({ request }) => {
    const calls = Array.from({ length: 20 }, () =>
      request.get(`${API}/api/events/sample-hack-2026/projects`),
    );
    const results = await Promise.all(calls);
    for (const r of results) expect(r.ok()).toBeTruthy();
  });
});

test.describe('NFR resilience', () => {
  test('dead webhook does not break submission', async ({ request }) => {
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const slug = `nfr-${stamp}`;
    const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();

    let res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: `NFR ${stamp}`, slug, description: 'resilience',
        submissions_open_at: open, submissions_close_at: close,
      },
    });
    const event = await res.json();
    res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(org), data: { name: 'General' },
    });
    const track = await res.json();
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `NFR Team ${stamp}` },
    });
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: `NFR Project ${stamp}`, summary: 's', track_id: track.id },
    });
    const project = await res.json();

    // Hook to a dead port: delivery fails in background, request must not.
    res = await request.post(`${API}/api/events/${slug}/webhooks`, {
      headers: auth(org),
      data: { url: 'http://127.0.0.1:9/hook', events: ['project.submitted'] },
    });
    expect(res.status()).toBe(201);

    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).is_draft).toBe(false);
  });

  test('oversized input is 422, never 500', async ({ request }) => {
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();
    let res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: `NFR2 ${stamp}`, slug: `nfr2-${stamp}`, description: 'x',
        submissions_open_at: open, submissions_close_at: close,
      },
    });
    const event = await res.json();
    res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(org), data: { name: 'General' },
    });
    const track = await res.json();
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `NFR2 Team ${stamp}` },
    });
    res = await request.post(`${API}/api/events/nfr2-${stamp}/projects`, {
      headers: auth(part),
      data: { title: 'T'.repeat(300), summary: 's', track_id: track.id },
    });
    expect(res.status()).toBe(422);
  });
});

test.describe('NFR auth boundaries', () => {
  test('protected endpoints need auth', async ({ request }) => {
    let res = await request.post(`${API}/api/events/sample-hack-2026/projects`, {
      data: { title: 'x', summary: 'y' },
    });
    expect(res.status()).toBe(401);

    res = await request.get(`${API}/api/judge/scores`);
    expect(res.status()).toBe(401);
  });

  test('roles cannot escalate', async ({ request }) => {
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const judge = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');

    let res = await request.post(`${API}/api/events`, {
      headers: auth(part),
      data: {
        name: 'Nope', slug: 'nope', submissions_open_at: new Date().toISOString(),
        submissions_close_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(res.status()).toBe(403);

    res = await request.get(`${API}/api/events/sample-hack-2026/export.csv`, {
      headers: auth(judge),
    });
    expect(res.status()).toBe(403);

    res = await request.post(`${API}/api/events/sample-hack-2026/bulk/import`, {
      headers: auth(part),
      data: { projects: [] },
    });
    expect(res.status()).toBe(403);
  });
});
