import { test, expect } from '@playwright/test';

// Pipeline-doc integrity controls: self-review exclusion, login rate
// limits, mutation audit, rubric freeze, conflicts, invite rotation.

const API = 'http://localhost:8000';
const JUDGE_A = '00000000-0000-0000-0000-000000000002';

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
  const open = new Date(Date.now() - 86400000).toISOString();
  const close = new Date(Date.now() + 30 * 86400000).toISOString();
  const res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `${tag} ${stamp}`, slug, description: 'integrity suite',
      submissions_open_at: open, submissions_close_at: close,
    },
  });
  expect(res.ok()).toBeTruthy();
  const event = await res.json();
  const t = await request.post(`${API}/api/events/${event.id}/tracks`, {
    headers: auth(org), data: { name: 'General' },
  });
  return { slug, org, event, track: await t.json() };
}

async function setupCriteria(request: any, org: string, eventId: string) {
  const res = await request.post(`${API}/api/events/${eventId}/criteria`, {
    headers: auth(org),
    data: { name: 'Quality', weight: 100, min_score: 1, max_score: 5 },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

test.describe('Integrity controls', () => {
  test('judge cannot score own team project', async ({ request }) => {
    const { slug, org, event, track } = await setupEvent(request, 'integ');
    const criteria = await setupCriteria(request, org, event.id);
    // judge_a joins a team, then is assigned: scoring must be refused
    const ja = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');
    let res = await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(ja), data: { name: `Judge Team ${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    await request.post(`${API}/api/events/${event.id}/judges/assign`, {
      headers: auth(org), data: { judge_id: JUDGE_A, track_id: track.id },
    });
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(ja),
      data: { title: 'Own Project', summary: 's', track_id: track.id },
    });
    const project = await res.json();
    await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(ja),
    });
    res = await request.post(`${API}/api/judge/scores/${project.id}`, {
      headers: auth(ja),
      data: [{ criteria_id: criteria.id, score: 5 }],
    });
    expect(res.status()).toBe(403);
  });

  test('login brute force is rate limited', async ({ request }) => {
    // Limit is 100/min per (IP, email): burst past it, last call must be 429.
    let last = 200;
    for (let i = 0; i < 102; i++) {
      const res = await request.post(`${API}/api/auth/login`, {
        data: { email: 'nobody@example.org', password: 'wrongpassword' },
      });
      last = res.status();
    }
    expect(last).toBe(429);
  });

  test('mutations land in the audit trail', async ({ request }) => {
    const { slug, org, event } = await setupEvent(request, 'integ');
    await setupCriteria(request, org, event.id);
    const res = await request.get(`${API}/api/events/${slug}/audit`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const actions = (await res.json()).map((a: any) => a.action);
    expect(actions).toContain('criteria.create');

    // Non-organizers cannot read it
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const denied = await request.get(`${API}/api/events/${slug}/audit`, {
      headers: auth(part),
    });
    expect(denied.status()).toBe(403);
  });

  test('frozen rubric rejects edits, freeze needs exact 100', async ({ request }) => {
    const { event, org } = await setupEvent(request, 'integ');
    // Partial rubric cannot freeze
    let res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org), data: { name: 'A', weight: 40 },
    });
    expect(res.status()).toBe(201);
    res = await request.post(`${API}/api/events/${event.id}/rubric/freeze`, {
      headers: auth(org),
    });
    expect(res.status()).toBe(400);

    res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org), data: { name: 'B', weight: 60 },
    });
    expect(res.status()).toBe(201);
    res = await request.post(`${API}/api/events/${event.id}/rubric/freeze`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org), data: { name: 'C', weight: 10 },
    });
    expect(res.status()).toBe(400);
  });

  test('declared conflicts block scoring until removed', async ({ request }) => {
    const { slug, org, event, track } = await setupEvent(request, 'integ');
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const ja = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');
    const criteria = await setupCriteria(request, org, event.id);
    await request.post(`${API}/api/events/${event.id}/judges/assign`, {
      headers: auth(org), data: { judge_id: JUDGE_A, track_id: track.id },
    });
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `Conflict Team ${Date.now()}` },
    });
    let res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: 'Conflict Project', summary: 's', track_id: track.id },
    });
    const project = await res.json();
    await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });

    res = await request.post(`${API}/api/events/${event.id}/conflicts`, {
      headers: auth(org),
      data: { judge_id: JUDGE_A, project_id: project.id, reason: 'knows the team' },
    });
    expect(res.status()).toBe(201);
    const conflict = await res.json();

    res = await request.post(`${API}/api/judge/scores/${project.id}`, {
      headers: auth(ja),
      data: [{ criteria_id: criteria.id, score: 4 }],
    });
    expect(res.status()).toBe(403);

    res = await request.delete(
      `${API}/api/events/${event.id}/conflicts/${conflict.id}`,
      { headers: auth(org) },
    );
    expect(res.status()).toBe(204);
    res = await request.post(`${API}/api/judge/scores/${project.id}`, {
      headers: auth(ja),
      data: [{ criteria_id: criteria.id, score: 4 }],
    });
    expect(res.ok()).toBeTruthy();
  });

  test('invite code rotation revokes the old link', async ({ request }) => {
    const { event, org } = await setupEvent(request, 'integ');
    const pw = 'testpass123';
    const stamp = Date.now();
    const mk = async (email: string) => {
      await request.post(`${API}/api/auth/register`, {
        data: { email, password: pw, full_name: email },
      });
      return apiLogin(request, email, pw);
    };
    const t1 = await mk(`rota${stamp}@example.org`);
    const t2 = await mk(`rotb${stamp}@example.org`);

    let res = await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(t1), data: { name: `Rota ${stamp}` },
    });
    const team = await res.json();
    const oldCode = team.invite_code;

    res = await request.post(
      `${API}/api/events/${event.id}/teams/${team.id}/invite-code/refresh`,
      { headers: auth(t1) },
    );
    expect(res.ok()).toBeTruthy();
    const rotated = await res.json();
    expect(rotated.invite_code).not.toBe(oldCode);

    // Stranger cannot rotate
    res = await request.post(
      `${API}/api/events/${event.id}/teams/${team.id}/invite-code/refresh`,
      { headers: auth(t2) },
    );
    expect(res.status()).toBe(403);

    // Old link dead, new link works
    res = await request.post(`${API}/api/events/${event.id}/teams/join-by-code`, {
      headers: auth(t2), data: { invite_code: oldCode },
    });
    expect(res.status()).toBe(404);
    res = await request.post(`${API}/api/events/${event.id}/teams/join-by-code`, {
      headers: auth(t2), data: { invite_code: rotated.invite_code },
    });
    expect(res.ok()).toBeTruthy();
  });
});
