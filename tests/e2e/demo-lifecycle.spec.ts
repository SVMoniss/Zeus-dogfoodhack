import { test, expect } from '@playwright/test';

// Full event lifecycle in ONE test so Playwright records it as ONE
// continuous video: create → submit → judge → publish.
// Setup runs via API (off camera); the UI tour is what the video shows.
// Output lands in test-results/ as .webm (gitignored raw footage).

const API = 'http://localhost:8000';

async function apiLogin(request: any, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.access_token as string;
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

test.describe('Demo lifecycle (video footage)', () => {
  test('create → submit → judge → publish', async ({ page, request }) => {
    const stamp = Date.now();
    const slug = `demo-day-${stamp}`;
    const title = `Demo Project ${stamp}`;

    // --- CREATE (API): organizer creates an open event with prizes ---
    const org = await apiLogin(request, 'organizer@dogfood.local', 'testpass123');
    const part = await apiLogin(request, 'participant@dogfood.local', 'testpass123');
    const judge = await apiLogin(request, 'judge_a@dogfood.local', 'testpass123');

    const open = new Date(Date.now() - 86400000).toISOString();
    const close = new Date(Date.now() + 30 * 86400000).toISOString();
    let res = await request.post(`${API}/api/events`, {
      headers: auth(org),
      data: {
        name: `Demo Day ${stamp}`,
        slug,
        description: 'Automated demo lifecycle for the submission video',
        submissions_open_at: open,
        submissions_close_at: close,
        prizes: [{ place: '1st', title: 'Grand Prize', amount: '800 USD' }],
      },
    });
    expect(res.ok()).toBeTruthy();
    const event = await res.json();

    res = await request.post(`${API}/api/events/${event.id}/tracks`, {
      headers: auth(org),
      data: { name: 'General' },
    });
    expect(res.ok()).toBeTruthy();
    const track = await res.json();

    res = await request.post(`${API}/api/events/${event.id}/criteria`, {
      headers: auth(org),
      data: {
        name: 'Functionality',
        description: 'Does it work?',
        weight: 100,
        min_score: 1,
        max_score: 5,
        display_order: 1,
      },
    });
    expect(res.ok()).toBeTruthy();
    const criteria = await res.json();

    // Assign judge_a (fixed seed user) to the track
    res = await request.post(`${API}/api/events/${event.id}/judges/assign`, {
      headers: auth(org),
      data: {
        judge_id: '00000000-0000-0000-0000-000000000002',
        track_id: track.id,
      },
    });
    expect(res.ok()).toBeTruthy();

    // --- SUBMIT (API): participant team + project + submit before deadline ---
    res = await request.post(`${API}/api/events/${event.id}/teams`, {
      headers: auth(part),
      data: { name: `Demo Team ${stamp}` },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`${API}/api/events/${slug}/projects`, {
      headers: auth(part),
      data: { title, summary: 'Submitted during the recorded demo', track_id: track.id },
    });
    expect(res.ok()).toBeTruthy();
    const project = await res.json();

    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();

    // --- JUDGE (API): judge_a scores the project ---
    res = await request.post(`${API}/api/judge/scores/${project.id}`, {
      headers: auth(judge),
      data: [{ criteria_id: criteria.id, score: 4, comment: 'Solid demo' }],
    });
    expect(res.ok()).toBeTruthy();

    // --- ON CAMERA: public gallery shows the submitted project ---
    await page.goto(`/events/${slug}/gallery`);
    await expect(page.locator(`text=${title}`)).toBeVisible();
    await page.waitForTimeout(800);

    // --- ON CAMERA: judge sees the project on their dashboard ---
    await uiLogin(page, 'judge_a@dogfood.local', 'testpass123');
    await page.goto(`/events/${slug}/judge`);
    await expect(page.locator('text=My Scores')).toBeVisible();
    await expect(page.locator(`text=${title}`)).toBeVisible();
    await page.waitForTimeout(800);

    // --- ON CAMERA: organizer progress dashboard ---
    await uiLogin(page, 'organizer@dogfood.local', 'testpass123');
    await page.goto(`/events/${slug}/organizer/dashboard`);
    await expect(page.locator('text=Organizer Dashboard')).toBeVisible();
    await expect(page.locator('text=Progress by Track')).toBeVisible();
    await page.waitForTimeout(800);

    // --- ON CAMERA (publish): organizer exports results CSV ---
    const downloadPromise = page.waitForEvent('download');
    await page.goto(`/events/${slug}/organizer/export`);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
    await page.waitForTimeout(800);
  });
});
