import { test, expect } from '@playwright/test';

// T1 team formation through the browser: create a team, share its invite
// code, and join as a second user. Users are freshly registered per run.

const API = 'http://localhost:8000';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function uiLogin(page: any, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*events/);
}

test.describe('T1 Team Formation', () => {
  test('create team, share invite code, join as second user', async ({ request, page }) => {
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const slug = `team-${stamp}`;
    const pw = 'testpass123';
    const emailA = `teama${stamp}@example.org`;
    const emailB = `teamb${stamp}@example.org`;

    // Fresh event with open submissions
    const org = await apiLogin(request, 'organizer@dogfood.local', pw);
    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();
    let res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: `Team ${stamp}`, slug, description: 'team formation',
        submissions_open_at: open, submissions_close_at: close,
      },
    });
    expect(res.ok()).toBeTruthy();

    // Two fresh participants via public registration
    for (const email of [emailA, emailB]) {
      res = await request.post(`${API}/api/auth/register`, {
        data: { email, password: pw, full_name: email.split('@')[0] },
      });
      expect(res.status()).toBe(201);
    }

    // User A creates a team in the browser
    await uiLogin(page, emailA, pw);
    await page.goto(`/events/${slug}/team`);
    await page.fill('#team_name', `Team ${stamp}`);
    await page.click('button:has-text("Create Team")');
    await expect(page.locator('text=Your Team')).toBeVisible({ timeout: 10000 });
    const codeText = await page.locator('text=Invite Code:').textContent();
    const code = codeText?.replace(/.*Invite Code:\s*/, '').trim() ?? '';
    expect(code.length).toBeGreaterThan(3);

    // User B joins with the code
    await uiLogin(page, emailB, pw);
    await page.goto(`/events/${slug}/team`);
    await page.fill('#invite_code', code);
    await page.click('button:has-text("Join Team")');
    await expect(page.locator(`text=Team ${stamp}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('organizer invites and assigns a judge from the dashboard', async ({ request, page }) => {
    const stamp = Date.now() + Math.floor(Math.random() * 100000);
    const slug = `judge-${stamp}`;
    const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();

    let res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: `Judge ${stamp}`, slug, description: 'judge invite',
        submissions_open_at: open, submissions_close_at: close,
      },
    });
    const event = await res.json();
    res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(org), data: { name: 'General' },
    });
    expect(res.ok()).toBeTruthy();

    await uiLogin(page, 'organizer@dogfood.local', 'testpass123');
    await page.goto(`/events/${slug}/organizer/dashboard`);
    await expect(page.locator('text=Organizer Dashboard')).toBeVisible();
    await page.fill('input[type="email"]', `newjudge${stamp}@example.org`);
    await page.selectOption('select', { index: 1 });
    await page.click('button:has-text("Invite & Assign")');
    await expect(page.locator('text=invited and assigned')).toBeVisible({ timeout: 10000 });
  });
});
