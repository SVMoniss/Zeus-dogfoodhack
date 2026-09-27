import { test, expect } from '@playwright/test';

test.describe('CSV Export', () => {
  test('organizer can download CSV export', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'organizer@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    const downloadPromise = page.waitForEvent('download');
    await page.goto('/events/sample-hack-2026/organizer/export');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.csv');
    const content = await download.createReadStream();
    const text = await new Promise<string>((resolve) => {
      let data = '';
      content.on('data', chunk => data += chunk);
      content.on('end', () => resolve(data));
    });
    expect(text).toContain('Project,Team,Track');
    expect(text).toContain('Total Weighted');
  });

  test('non-organizer cannot download CSV', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'participant@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*events/);

    await page.goto('/events/sample-hack-2026/organizer/export');
    await expect(page.locator('text=Insufficient permissions')).toBeVisible({ timeout: 5000 });
  });
});