import { test, expect } from '@playwright/test';

test.describe('Public Gallery', () => {
  test('gallery is accessible without auth', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    await expect(page.locator('text=Sample Hack 2026')).toBeVisible();
  });

  test('gallery shows fixture projects', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    await expect(page.locator('text=Glass Signal')).toBeVisible();
    await expect(page.locator('text=Small Meadow')).toBeVisible();
    await expect(page.locator('text=Deep Compass')).toBeVisible();
  });

  test('gallery has search and filter', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });
});