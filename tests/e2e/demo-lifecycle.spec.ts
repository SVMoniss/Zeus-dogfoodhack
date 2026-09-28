import { test, expect } from '@playwright/test';

// Full event lifecycle as ONE continuous take: create → submit → judge → publish.
// API setup runs in beforeAll (off camera); the test body is the UI tour the
// video shows, paced for narration (~5 minutes).
// Run with: npx playwright test tests/e2e/demo-lifecycle.spec.ts --timeout=420000
// Footage lands in test-results/<test-name>-chromium/video.webm (.webm, gitignored).

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

/** Human-paced typing for the camera (clears pre-filled values first). */
async function typeSlow(page: any, selector: string, text: string, delay = 110) {
  const el = page.locator(selector).first();
  await el.click();
  await el.fill('');
  await el.pressSequentially(text, { delay });
}

async function uiLogin(page: any, email: string, password: string, landing: RegExp) {
  await page.context().clearCookies();
  await page.goto('/login');
  await expect(page.locator('text=Sign in to your account')).toBeVisible();
  await page.waitForTimeout(1500);
  await typeSlow(page, 'input[type="email"]', email, 35);
  await page.waitForTimeout(500);
  await typeSlow(page, 'input[type="password"]', password, 35);
  await page.waitForTimeout(500);
  await page.click('button[type="submit"]');
  await page.waitForURL(landing);
}

async function scrollTour(page: any, pause = 8000) {
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await page.waitForTimeout(pause);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
}

test.describe('Demo lifecycle (video footage)', () => {
  // Paged for narration (~5 min of footage); needs a longer budget than the
  // 30 s default when run inside the full suite.
  test.describe.configure({ timeout: 420000 });
  let slug: string;
  let title: string;
  let projectId: string;
  let uiTitle: string;
  let fixtureProjectId: string;
  let fixtureProjectTitle: string;

  test.beforeAll(async ({ request }) => {
    const stamp = Date.now();
    slug = `demo-day-${stamp}`;
    title = `Demo Project ${stamp}`;
    uiTitle = `Demo UI Submission ${stamp}`;

    // --- CREATE (API, off camera): organizer creates an open event ---
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

    // Open the community-voting window so the tour can cast a vote on camera.
    res = await request.patch(`${API}/api/events/${event.id}`, {
      headers: auth(org),
      data: { voting_open_at: open, voting_close_at: close },
    });
    expect(res.ok()).toBeTruthy();

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

    res = await request.post(`${API}/api/events/${event.id}/judges/assign`, {
      headers: auth(org),
      data: {
        judge_id: '00000000-0000-0000-0000-000000000002',
        track_id: track.id,
      },
    });
    expect(res.ok()).toBeTruthy();

    // --- SUBMIT (API, off camera): participant team + project + submit ---
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
    projectId = project.id;

    res = await request.post(`${API}/api/events/${slug}/projects/${project.id}/submit`, {
      headers: auth(part),
    });
    expect(res.ok()).toBeTruthy();

    // --- JUDGE (API, off camera): judge_a scores the project ---
    res = await request.post(`${API}/api/judge/scores/${project.id}`, {
      headers: auth(judge),
      data: [{ criteria_id: criteria.id, score: 4, comment: 'Solid demo' }],
    });
    expect(res.ok()).toBeTruthy();

    // A fixture project for the public-gallery beats (fixture event is seeded).
    res = await request.get(`${API}/api/events/sample-hack-2026/projects`);
    expect(res.ok()).toBeTruthy();
    const fixture = (await res.json())[0];
    fixtureProjectId = fixture.id;
    fixtureProjectTitle = fixture.title;
  });

  test('create → submit → judge → publish', async ({ page }) => {
    // === 1. LANDING: public marketing page ===
    await page.goto('/');
    await expect(page.locator('text=real platforms').first()).toBeVisible();
    await page.waitForTimeout(4000);
    await scrollTour(page);

    // === 1b. REGISTER: a brand-new participant account ===
    const newcomer = `newcomer-${Date.now()}@example.org`;
    await page.goto('/register');
    await expect(page.locator('text=Create your account')).toBeVisible();
    await page.waitForTimeout(2500);
    await typeSlow(page, '#full_name', 'Demo Newcomer', 70);
    await page.waitForTimeout(500);
    await typeSlow(page, '#email', newcomer, 40);
    await page.waitForTimeout(500);
    await typeSlow(page, '#password', 'DemoPass123', 60);
    await page.waitForTimeout(500);
    await typeSlow(page, '#confirm_password', 'DemoPass123', 60);
    await page.waitForTimeout(1500);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events/);
    await expect(page.locator('text=Join the world\'s best hackathons')).toBeVisible();
    await page.waitForTimeout(7000);

    // === 2. PUBLIC GALLERY: search + track filter, no auth ===
    await page.goto('/projects');
    await expect(page.locator('text=Submitted projects')).toBeVisible();
    await expect(page.locator(`text=${fixtureProjectTitle}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await typeSlow(page, 'input[placeholder="Search title, team, or tag…"]', 'Glass', 90);
    await page.waitForTimeout(4000);
    await page.locator('input[placeholder="Search title, team, or tag…"]').fill('');
    await page.waitForTimeout(1500);
    await page.locator('select').first().selectOption({ index: 1 });
    await page.waitForTimeout(5000);
    await scrollTour(page);

    // === 3. PROJECT DETAIL (public) ===
    await page.goto(`/projects/${fixtureProjectId}`);
    await expect(page.locator(`text=${fixtureProjectTitle}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await scrollTour(page, 2500);

    // === 4. PARTICIPANT: login → dashboard → teams ===
    // Spec requirement: sign-in lands on the events listing for every role;
    // role workspaces are reached via direct navigation.
    await uiLogin(page, 'participant@dogfood.local', 'testpass123', /\/events/);
    await page.goto('/dashboard');
    await expect(page.locator('text=Participant Dashboard')).toBeVisible();
    await page.waitForTimeout(4000);
    await page.goto('/teams');
    await expect(page.locator('text=My Team').first()).toBeVisible();
    await page.waitForTimeout(3000);
    await scrollTour(page, 2500);

    // === 4b. CLOSED EVENT (on camera): the fixture event refuses submissions ===
    await page.goto('/projects/new');
    await expect(page.locator('text=Submissions closed')).toBeVisible();
    await page.waitForTimeout(7000);

    // === 5. SUBMIT (on camera): team-aware form against the open demo event ===
    await page.goto(`/projects/new?event=${slug}`);
    await expect(page.locator('text=New Submission')).toBeVisible();
    await page.waitForTimeout(3000);
    await typeSlow(page, '#title', uiTitle);
    await page.waitForTimeout(800);
    await typeSlow(page, '#summary', 'A second submission, filed live through the UI');
    await page.waitForTimeout(800);
    await typeSlow(page, '#description', 'This project proves the participant submission flow end to end.');
    await page.waitForTimeout(800);
    await typeSlow(page, '#repo_url', 'https://example.org/demo-repo');
    await page.waitForTimeout(800);
    await page.locator('#track_id').selectOption({ label: 'General' });
    await page.waitForTimeout(2000);
    await scrollTour(page, 2000);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/projects\/[0-9a-f-]+/);
    await expect(page.locator(`text=${uiTitle}`).first()).toBeVisible();
    await page.waitForTimeout(7000);
    const uiProjectId = page.url().split('/').pop();

    // === 5b. EDIT (on camera): revise the draft before the deadline ===
    await page.goto(`/projects/${uiProjectId}/edit`);
    await expect(page.locator('text=Edit Project')).toBeVisible();
    await page.waitForTimeout(3000);
    await typeSlow(page, '#summary', 'A second submission, filed live and revised before the deadline');
    await page.waitForTimeout(1500);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/projects/${uiProjectId}`));
    await expect(page.locator('text=revised before the deadline').first()).toBeVisible();
    await page.waitForTimeout(7000);

    // === 6. JUDGE: login → workspace → score the demo project live ===
    await uiLogin(page, 'judge_a@dogfood.local', 'testpass123', /\/events/);
    await page.goto('/judge');
    await expect(page.locator('text=Judge Workspace')).toBeVisible();
    await page.waitForTimeout(4000);
    await page.goto(`/judge/project/${projectId}?event=${slug}`);
    await expect(page.locator(`text=${title}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await typeSlow(page, 'input[type="number"]', '5', 120);
    await page.waitForTimeout(800);
    await typeSlow(page, 'input[placeholder="Comment (optional)"]', 'Excellent demo execution');
    await page.waitForTimeout(1500);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Scores saved.')).toBeVisible();
    await page.waitForTimeout(7000);

    // === 7. JUDGE SCORES: own-scores table (peer data never visible) ===
    await page.goto('/judge/scores');
    await expect(page.locator('h1:has-text("My Scores")')).toBeVisible();
    await expect(page.locator('text=Excellent demo execution').first()).toBeVisible();
    await page.waitForTimeout(3000);
    await scrollTour(page, 2500);

    // === 7b. COMMUNITY VOTE (on camera): email ballot, then 4 stars ===
    await page.goto(`/events/${slug}/vote`);
    await expect(page.locator('text=Community Vote')).toBeVisible();
    await page.waitForTimeout(3000);
    await typeSlow(page, 'input[type="email"]', 'voter@example.org', 45);
    await page.waitForTimeout(800);
    await page.click('text=Email me a ballot');
    await expect(page.locator(`text=${title}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: `Vote 4 for ${title}` }).click();
    await expect(page.locator('text=Voted ✓').first()).toBeVisible();
    await page.waitForTimeout(7000);

    // === 8. ORGANIZER: login → workspace → live progress dashboard ===
    await uiLogin(page, 'organizer@dogfood.local', 'testpass123', /\/events/);
    await expect(page.locator('text=Organizer').first()).toBeVisible();
    await page.waitForTimeout(4000);
    await page.goto(`/organizer/dashboard?event=${slug}`);
    await expect(page.locator('text=Organizer Dashboard')).toBeVisible();
    await expect(page.locator('h2:has-text("By Track")')).toBeVisible();
    await page.waitForTimeout(4000);
    await scrollTour(page);

    // === 9. PUBLISH: CSV export downloads as an attachment ===
    await page.goto(`/organizer/export?event=${slug}`);
    await expect(page.locator('text=Export Results')).toBeVisible();
    await page.waitForTimeout(3000);
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download CSV');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
    await expect(page.locator('text=CSV downloaded as attachment.')).toBeVisible();
    await page.waitForTimeout(8000);

    // === 10. AUDIT: organizer-readable trail for the demo event ===
    await page.goto(`/organizer/audit?event=${slug}`);
    await expect(page.locator('text=Audit Log')).toBeVisible();
    await page.waitForTimeout(4000);
    await scrollTour(page, 3000);

    // === 10b. INTEGRATIONS: API keys, webhooks, certificates, bulk I/O ===
    await page.goto(`/events/${slug}/organizer/integrations`);
    await expect(page.locator('text=Integrations & Records')).toBeVisible();
    await expect(page.locator('text=API keys')).toBeVisible();
    await page.waitForTimeout(4000);
    await scrollTour(page, 3000);

    // === 11. EVENT DETAIL + COMMENT: event page, then feedback on the project ===
    await page.goto(`/events/${slug}`);
    await expect(page.locator(`text=Demo Day`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await scrollTour(page, 3000);
    await page.goto(`/events/${slug}/projects/${projectId}`);
    await expect(page.locator(`text=${title}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    const commentText = `Great demo energy, watched live at ${new Date().toISOString().slice(11, 16)} UTC`;
    await typeSlow(page, 'textarea[name="content"]', commentText, 45);
    await page.waitForTimeout(800);
    await page.click('button[type="submit"]');
    await expect(page.locator(`text=${commentText}`).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(7000);

    // === 12. FINALE: event gallery shows the submitted project ===
    await page.goto(`/events/${slug}/gallery`);
    await expect(page.locator(`text=${title}`).first()).toBeVisible();
    await page.waitForTimeout(3000);
    await scrollTour(page, 8000);
    await page.waitForTimeout(8000);
  });
});
