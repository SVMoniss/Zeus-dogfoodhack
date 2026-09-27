import { test, expect } from '@playwright/test';
import http from 'http';
import crypto from 'crypto';

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

    res = await request.get(`${API}/api/v1/events/${slug}/projects`, {
      headers: { 'X-API-Key': created.key },
    });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);

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
    expect(hook.secret).toBeTruthy();

    res = await request.get(`${API}/api/events/${slug}/webhooks`, { headers: auth(org) });
    expect((await res.json()).length).toBe(1);

    res = await request.delete(`${API}/api/events/${slug}/webhooks/${hook.id}`, {
      headers: auth(org),
    });
    expect(res.status()).toBe(204);
  });

  test('submit fires HMAC-signed delivery', async ({ request }) => {
    // Catcher on the host; containers reach it via host.docker.internal.
    const received: { headers: any; raw: string }[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ headers: req.headers, raw: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(200);
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
    const port = (server.address() as any).port;
    try {
      const stamp = Date.now() + Math.floor(Math.random() * 100000);
      const slug = `t4hook-${stamp}`;
      const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
      const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
      const open = new Date(Date.now() - 86400000).toISOString();
      const close = new Date(Date.now() + 30 * 86400000).toISOString();

      let res = await request.post(`${API}/api/events`, {
        headers: auth(org),
        data: {
          name: `T4Hook ${stamp}`, slug, description: 'hook delivery',
          submissions_open_at: open, submissions_close_at: close,
        },
      });
      const event = await res.json();
      res = await request.post(`${API}/api/events/${event.id}/tracks`, {
        headers: auth(org), data: { name: 'General' },
      });
      const track = await res.json();
      await request.post(`${API}/api/events/${event.id}/teams`, {
        headers: auth(part), data: { name: `Hook Team ${stamp}` },
      });
      res = await request.post(`${API}/api/events/${slug}/projects`, {
        headers: auth(part),
        data: { title: `Hook Project ${stamp}`, summary: 'fires webhook', track_id: track.id },
      });
      const project = await res.json();

      res = await request.post(`${API}/api/events/${slug}/webhooks`, {
        headers: auth(org),
        data: { url: `http://host.docker.internal:${port}/hook`, events: ['project.submitted'] },
      });
      const hook = await res.json();

      res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
        headers: auth(part),
      });
      expect(res.ok()).toBeTruthy();

      // Delivery is async (BackgroundTasks): poll for it.
      const deadline = Date.now() + 15000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(received.length).toBeGreaterThan(0);
      const [first] = received;
      expect(first.headers['x-dogfood-event']).toBe('project.submitted');
      const expected = crypto.createHmac('sha256', hook.secret).update(first.raw).digest('hex');
      expect(first.headers['x-dogfood-signature']).toBe(expected);
      expect(JSON.parse(first.raw).data.project_id).toBe(project.id);
    } finally {
      server.close();
    }
  });
});

test.describe('T4 key isolation', () => {
  test('keys are event-scoped and permission-checked', async ({ request }) => {
    const a = await setupEvent(request);
    const b = await setupEvent(request);

    let res = await request.post(`${API}/api/events/${a.slug}/api-keys`, {
      headers: auth(a.org),
      data: { name: 'scoped', permissions: ['read'] },
    });
    const key = (await res.json()).key;

    // Other event -> 403
    res = await request.get(`${API}/api/v1/events/${b.slug}`, {
      headers: { 'X-API-Key': key },
    });
    expect(res.status()).toBe(403);

    // Write-only key on own event -> 403 (v1 needs read)
    res = await request.post(`${API}/api/events/${a.slug}/api-keys`, {
      headers: auth(a.org),
      data: { name: 'write-only', permissions: ['write'] },
    });
    const writeOnly = (await res.json()).key;
    res = await request.get(`${API}/api/v1/events/${a.slug}`, {
      headers: { 'X-API-Key': writeOnly },
    });
    expect(res.status()).toBe(403);
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

    // Unknown id -> 404
    res = await request.get(
      `${API}/api/certificates/verify?certificate_id=00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status()).toBe(404);

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
    expect(body).toContain('data-dogfood-gallery');
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

  test('bulk import reports per-record errors', async ({ request }) => {
    const { slug, org } = await setupEvent(request);
    const res = await request.post(`${API}/api/events/${slug}/bulk/import`, {
      headers: auth(org),
      data: {
        projects: [
          { title: 'Good One', summary: 's', team: 'Bulk Team' },
          { title: '', summary: 'missing title' },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const job = await res.json();
    expect(job.records_processed).toBe(1);
    expect(job.records_failed).toBe(1);
  });
});

test.describe('T4 integrations UI', () => {
  test('organizer issues a key from the UI', async ({ request, page }) => {
    const { slug } = await setupEvent(request);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'organizer@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    await page.goto(`/events/${slug}/organizer/integrations`);
    await expect(page.locator('text=API keys')).toBeVisible();
    await page.fill('input[placeholder="Key name"]', 'ui-key');
    await page.click('button:has-text("Create")');
    await expect(page.locator('text=New secret')).toBeVisible();
  });
});
