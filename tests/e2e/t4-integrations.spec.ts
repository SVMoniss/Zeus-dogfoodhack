import { test, expect } from '@playwright/test';

// T4: keyed REST API, webhooks, signed certificates, widget, bulk jobs.
// Each test builds its own event via API.

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

async function setupEvent(request: any) {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const slug = `t4-${stamp}`;
  const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
  const res = await request.post(`${API}/api/events`, {
    headers: auth(org),
    data: {
      name: `T4 ${stamp}`, slug, description: 't4 suite',
      submissions_open_at: new Date(Date.now() - 86400000).toISOString(),
      submissions_close_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
  });
  expect(res.ok()).toBeTruthy();
  return { slug, org, event: await res.json() };
}

test.describe('T4 API keys + REST', () => {
  test('issue key, read v1, revoke key', async ({ request }) => {
    const { slug, org } = await setupEvent(request);

    let res = await request.post(`${API}/api/events/${slug}/api-keys`, {
      headers: auth(org),
      data: { name: 'ci', permissions: ['read'] },
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created.key).toMatch(/^dfr_/);

    // No key -> refused
    res = await request.get(`${API}/api/v1/events/${slug}`);
    expect(res.status()).toBe(401);

    // Key -> event + projects
    res = await request.get(`${API}/api/v1/events/${slug}`, {
      headers: { 'X-API-Key': created.key },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).slug).toBe(slug);

    // Revoke -> refused again
    res = await request.delete(`${API}/api/events/${slug}/api-keys/${created.id}`, {
      headers: auth(org),
    });
    expect(res.status()).toBe(204);
    res = await request.get(`${API}/api/v1/events/${slug}`, {
      headers: { 'X-API-Key': created.key },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('T4 webhooks', () => {
  test('crud lifecycle', async ({ request }) => {
    const { slug, org } = await setupEvent(request);

    let res = await request.post(`${API}/api/events/${slug}/webhooks`, {
      headers: auth(org),
      data: { url: 'https://example.org/hook', events: ['project.submitted'] },
    });
    expect(res.status()).toBe(201);
    const hook = await res.json();

    res = await request.get(`${API}/api/events/${slug}/webhooks`, { headers: auth(org) });
    expect((await res.json()).length).toBe(1);

    res = await request.delete(`${API}/api/events/${slug}/webhooks/${hook.id}`, {
      headers: auth(org),
    });
    expect(res.status()).toBe(204);
  });
});

test.describe('T4 certificates', () => {
  test('generate then publicly verify', async ({ request, page }) => {
    const { slug, org } = await setupEvent(request);

    let res = await request.post(`${API}/api/events/${slug}/certificates`, {
      headers: auth(org),
      data: {
        recipient_type: 'user', recipient_id: JUDGE_A,
        certificate_type: 'judge_service', title: 'Judge service',
      },
    });
    expect(res.status()).toBe(201);
    const cert = await res.json();
    expect(cert.signature).toBeTruthy();
    expect(cert.public_key).toBeTruthy();

    res = await request.get(`${API}/api/certificates/verify?certificate_id=${cert.id}`);
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).valid).toBe(true);

    await page.goto(`/certificates/verify?id=${cert.id}`);
    await expect(page.locator('text=Valid signature')).toBeVisible();
  });
});

test.describe('T4 widget + bulk', () => {
  test('widget.js serves javascript', async ({ request }) => {
    const { slug } = await setupEvent(request);
    const res = await request.get(`${API}/api/events/${slug}/widget.js`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('javascript');
    const body = await res.text();
    expect(body).toContain(slug);
  });

  test('bulk export then import', async ({ request }) => {
    const { slug, org } = await setupEvent(request);

    let res = await request.get(`${API}/api/events/${slug}/bulk/export`, {
      headers: auth(org),
    });
    expect(res.ok()).toBeTruthy();
    const dump = await res.json();
    expect(dump.event.slug).toBe(slug);

    res = await request.post(`${API}/api/events/${slug}/bulk/import`, {
      headers: auth(org),
      data: { projects: [{ title: 'Bulk T4', summary: 's', team: 'Bulk Team' }] },
    });
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.records_processed).toBe(1);

    res = await request.get(`${API}/api/events/${slug}/bulk/jobs`, { headers: auth(org) });
    expect((await res.json()).length).toBeGreaterThan(0);
  });
});
