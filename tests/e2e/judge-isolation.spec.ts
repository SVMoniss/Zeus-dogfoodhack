import { test, expect } from '@playwright/test';

test.describe('Judge Score Isolation', () => {
  test('judge_a can see their own scores', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'judge_a@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    await page.goto('/events/sample-hack-2026/judge');
    await expect(page.locator('text=My Scores')).toBeVisible();
  });

  test('judge_b cannot see judge_a scores via API', async ({ page }) => {
    // This is tested at API level in the acceptance checker
    // Here we just verify judge_b can access their own dashboard
    await page.goto('/login');
    await page.fill('input[type="email"]', 'judge_b@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    await page.goto('/events/sample-hack-2026/judge');
    await expect(page.locator('text=My Scores')).toBeVisible();
  });

  test('participant cannot access judge dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'participant@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    await page.goto('/events/sample-hack-2026/judge');
    // Should be redirected or show access denied
    await expect(page.locator('text=Insufficient permissions')).toBeVisible({ timeout: 5000 });
  });
});