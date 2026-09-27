import { test, expect } from '@playwright/test';

// T3: email-gated voting, randomized ballots, duplicates, hidden results,
// comments with moderation, audit trail. Each test builds its own event.

const API = 'http://localhost:8000';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setupEvent(request: any, withProject = true) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const slug = `t3-${stamp}`;
  const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
  const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
  const open = new Date(Date.now() - 86400000).toISOString();
  const close = new Date(Date.now() + 30 * 86400000).toISOString();

  let res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `T3 ${stamp}`, slug, description: 't3 suite',
      submissions_open_at: open, submissions_close_at: close,
      voting_open_at: open, voting_close_at: close,
    },
  });
  expect(res.ok()).toBeTruthy();
  const event = await res.json();

  res = await request.post(`${API}/api/events/${event.id}/tracks`, {
    headers: auth(org), data: { name: 'General' },
  });
  const track = await res.json();

  let project: any = null;
  if (withProject) {
    await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part), data: { name: `T3 Team ${stamp}` },
    });
    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title: `T3 Project ${stamp}`, summary: 'vote target', track_id: track.id },
    });
    project = await res.json();
    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();
  }
  return { slug, event, track, project, org };
}

test.describe('T3 Community Voting', () => {
  test('token → ballot → vote → duplicate refused', async ({ request }) => {
    const { slug, project } = await setupEvent(request);

    let res = await request.post(`${API}/api/events/${slug}/voting/token`, {
      data: { email: 'voter@example.org' },
    });
    expect(res.status()).toBe(201);
    const { token } = await res.json();

    // Ballot is deterministic per token (same shuffle on reload)
    const b1 = await (await request.get(`${API}/api/events/${slug}/ballot?token=${token}`)).json();
    const b2 = await (await request.get(`${API}/api/events/${slug}/ballot?token=${token}`)).json();
    expect(b1.projects.map((p: any) => p.id)).toEqual(b2.projects.map((p: any) => p.id));
    expect(b1.projects.length).toBe(1);

    res = await request.post(`${API}/api/events/${slug}/voting/votes`, {
      data: { token, project_id: project.id, score: 5 },
    });
    expect(res.status()).toBe(201);

    res = await request.post(`${API}/api/events/${slug}/voting/votes`, {
      data: { token, project_id: project.id, score: 4 },
    });
    expect(res.status()).toBe(400);

    res = await request.post(`${API}/api/events/${slug}/voting/votes`, {
      data: { token: '00000000-0000-0000-0000-000000000000', project_id: project.id, score: 3 },
    });
    expect(res.status()).toBe(401);
  });

  test('results hidden until published, organizer always sees', async ({ request }) => {
    const { slug, org } = await setupEvent(request, false);

    const anon = await request.get(`${API}/api/events/${slug}/voting/results`);
    expect(anon.status()).toBe(403);

    const res = await request.get(`${API}/api/events/${slug}/voting/results`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
  });

  test('comments held for moderation then approved', async ({ request, page }) => {
    const { slug, project, org } = await setupEvent(request);

    let res = await request.post(
      `${API}/api/events/${slug}/projects/${project.id}/comments`,
      { data: { content: 'Nice build!', author_name: 'Fan', author_email: 'fan@example.org' } },
    );
    expect(res.status()).toBe(201);
    expect((await res.json()).is_approved).toBe(false);

    // Not publicly visible before approval
    res = await request.get(`${API}/api/events/${slug}/projects/${project.id}/comments`);
    expect((await res.json()).length).toBe(0);

    // Organizer sees pending in ?status=all and approves it
    res = await request.get(
      `${API}/api/events/${slug}/projects/${project.id}/comments?status=all`,
      { headers: auth(org) },
    );
    const pending = await res.json();
    expect(pending.length).toBe(1);
    res = await request.patch(
      `${API}/api/events/${slug}/comments/${pending[0].id}/approve`,
      { headers: auth(org) },
    );
    expect(res.ok()).toBeTruthy();

    // Now visible publicly and on the project page
    res = await request.get(`${API}/api/events/${slug}/projects/${project.id}/comments`);
    expect((await res.json()).length).toBe(1);
    await page.goto(`/events/${slug}/projects/${project.id}`);
    await expect(page.locator('text=Nice build!')).toBeVisible();
  });

  test('votes through the ballot UI', async ({ request, page }) => {
    const { slug } = await setupEvent(request);

    await page.goto(`/events/${slug}/vote`);
    await page.fill('input[type="email"]', 'voter-ui@example.org');
    await page.click('button[type="submit"]');
    const star = page.getByRole('button', { name: /Vote 5 for T3 Project/ });
    await expect(star).toBeVisible({ timeout: 10000 });
    await star.click();
    await expect(page.locator('text=Voted ✓')).toBeVisible();
  });

  test('token rate limit enforced', async ({ request }) => {
    const { slug } = await setupEvent(request, false);
    let last = 200;
    for (let i = 0; i < 6; i++) {
      const res = await request.post(`${API}/api/events/${slug}/voting/token`, {
        data: { email: 'thirsty@example.org' },
      });
      last = res.status();
    }
    expect(last).toBe(429);
  });

  test('closed voting window refuses tokens', async ({ request }) => {
    const { slug, event, org } = await setupEvent(request, false);
    const past = new Date(Date.now() - 86400000).toISOString();
    const res0 = await request.patch(`${API}/api/events/${event.id}`, {
      headers: auth(org),
      data: { voting_close_at: past },
    });
    expect(res0.ok()).toBeTruthy();
    const res = await request.post(`${API}/api/events/${slug}/voting/token`, {
      data: { email: 'late@example.org' },
    });
    expect(res.status()).toBe(400);
  });

  test('published results are public', async ({ request }) => {
    const { slug, event, org } = await setupEvent(request);
    const past = new Date(Date.now() - 3600000).toISOString();
    const res0 = await request.patch(`${API}/api/events/${event.id}`, {
      headers: auth(org),
      data: { results_published_at: past },
    });
    expect(res0.ok()).toBeTruthy();
    const res = await request.get(`${API}/api/events/${slug}/voting/results`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('audit trail records voting activity', async ({ request }) => {
    const { slug, org } = await setupEvent(request, false);
    await request.post(`${API}/api/events/${slug}/voting/token`, {
      data: { email: 'audited@example.org' },
    });
    const res = await request.get(`${API}/api/events/${slug}/voting/audit`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const rows = await res.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].action).toBeTruthy();
  });

});
