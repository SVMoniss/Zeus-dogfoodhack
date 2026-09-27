import { test, expect } from '@playwright/test';

// Functional edges: validation caps, duplicates, idempotency guards,
// coexistence of awkward fixture data. Each test builds its own event.

const API = 'http://localhost:8000';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setupEvent(request: any, tag: string) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const slug = `${tag}-${stamp}`;
  const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
  const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
  const open = new Date(Date.now() - 86400000).toISOString();
  const close = new Date(Date.now() + 30 * 86400000).toISOString();
  const res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `${tag} ${stamp}`, slug, description: 'edge suite',
      submissions_open_at: open, submissions_close_at: close,
    },
  });
  expect(res.ok()).toBeTruthy();
  return { slug, org, part, event: await res.json() };
}

test.describe('Edge cases', () => {
  test('rubric weights cannot exceed 100%', async ({ request }) => {
    const { event, org } = await setupEvent(request, 'edge');
    let res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org), data: { name: 'A', weight: 60 },
    });
    expect(res.status()).toBe(201);
    res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org), data: { name: 'B', weight: 50 },
    });
    expect(res.status()).toBe(400);
  });

  test('full team refuses a second member, wrong code refused', async ({ request }) => {
    const { event, org } = await setupEvent(request, 'edge');
    void org;
    const pw = 'testpass123';
    const mkUser = async (email: string) => {
      const res = await request.post(`${API}/api/auth/register`, {
        data: { email, password: pw, full_name: email },
      });
      expect(res.status()).toBe(201);
      return apiLogin(request, email, pw);
    };
    const stamp = Date.now();
    const t1 = await mkUser(`edgea${stamp}@example.org`);
    const t2 = await mkUser(`edgeb${stamp}@example.org`);

    let res = await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(t1), data: { name: `Solo ${stamp}`, max_members: 1 },
    });
    expect(res.status()).toBe(201);
    const team = await res.json();

    res = await request.post(`${API}/api/events/${event.id}/teams/${team.id}/join`, {
      headers: auth(t2), data: { invite_code: 'WRONGCODE' },
    });
    expect(res.status()).toBe(400);

    res = await request.post(`${API}/api/events/${event.id}/teams/join-by-code`, {
      headers: auth(t2), data: { invite_code: team.invite_code },
    });
    expect(res.status()).toBe(400); // team is full (max 1)
  });

  test('event slugs are unique', async ({ request }) => {
    const { org } = await setupEvent(request, 'edge');
    const res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: 'Dup', slug: 'sample-hack-2026', description: 'dup',
        submissions_open_at: new Date().toISOString(),
        submissions_close_at: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test('comment validation rejects empty and oversize', async ({ request }) => {
    const { slug, event, part, org } = await setupEvent(request, 'edge');
    let res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(org),
      data: { name: 'General' },
    });
    const track = await res.json();
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `Edge Team ${Date.now()}` },
    });
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: 'Edge Project', summary: 's', track_id: track.id },
    });
    const project = await res.json();
    await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });

    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/comments`, {
      data: { content: '   ', author_name: 'X', author_email: 'x@example.org' },
    });
    expect(res.status()).toBe(400);

    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/comments`, {
      data: { content: 'y'.repeat(5001), author_name: 'X', author_email: 'x@example.org' },
    });
    expect(res.status()).toBe(400);
  });

  test('vote on draft project is refused', async ({ request }) => {
    const { slug, event, part } = await setupEvent(request, 'edge');
    const orgTok = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
    let res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(orgTok), data: { name: 'General' },
    });
    const track = await res.json();
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `Draft Team ${Date.now()}` },
    });
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: 'Draft Project', summary: 's', track_id: track.id },
    });
    const project = await res.json();
    // Deliberately NOT submitted: still a draft.

    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();
    await request.patch(`${API}/api/events/${event.id}`, {
      headers: auth(orgTok),
      data: { voting_open_at: open, voting_close_at: close },
    });
    res = await request.post(`${API}/api/events/${slug}/voting/token`, {
      data: { email: 'draftvoter@example.org' },
    });
    const { token } = await res.json();
    res = await request.post(`${API}/api/events/${slug}/voting/votes`, {
      data: { token, project_id: project.id, score: 4 },
    });
    expect(res.status()).toBe(404);
  });

  test('duplicate fixture submissions coexist', async ({ request }) => {
    const res = await request.get(`${API}/api/events/sample-hack-2026/projects?limit=100`);
    expect(res.ok()).toBeTruthy();
    const titles = (await res.json()).map((p: any) => p.title);
    const seen = new Set<string>();
    const dupes = titles.filter((t: string) => (seen.has(t) ? true : (seen.add(t), false)));
    expect(dupes.length).toBeGreaterThan(0);
  });

  test('unknown event slug is 404, not 500', async ({ request }) => {
    const res = await request.get(`${API}/api/events/no-such-event-xyz/projects`);
    expect(res.status()).toBe(404);
  });

  test('gallery pagination bounds', async ({ request }) => {
    let res = await request.get(`${API}/api/events/sample-hack-2026/projects?limit=1`);
    expect((await res.json()).length).toBe(1);
    res = await request.get(`${API}/api/events/sample-hack-2026/projects?page=9999`);
    expect((await res.json()).length).toBe(0);
  });
});
