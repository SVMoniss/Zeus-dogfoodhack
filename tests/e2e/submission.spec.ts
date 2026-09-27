import { test, expect } from '@playwright/test';

test.describe('Submission Deadline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'participant@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);
  });

  test('submission form accessible before deadline', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/submit');
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('textarea[name="summary"]')).toBeVisible();
  });

  test('submission rejected after deadline', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/submit');
    await page.fill('input[name="title"]', 'Test Project');
    await page.fill('textarea[name="summary"]', 'Test summary');
    // Pick any track/team so client-side validation passes and the request
    // reaches the backend, which must refuse: fixture deadline is past
    await page.selectOption('select[name="track_id"]', { index: 1 });
    await page.selectOption('select[name="team_id"]', { index: 1 });
    await page.click('button[type="submit"]');
    // The fixture event deadline is 2026-03-01T18:00:00Z which is in the past
    await expect(page.locator('text=Submissions are closed')).toBeVisible({ timeout: 10000 });
  });
});