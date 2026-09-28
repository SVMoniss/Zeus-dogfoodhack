import { test, expect } from '@playwright/test';

test.describe('Public Gallery', () => {
  test('gallery is accessible without auth', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    await expect(page.locator('text=Sample Hack 2026')).toBeVisible();
  });

  test('gallery shows fixture projects', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    // Page one shows fixture project cards; search narrows to the first one
    // (gallery order is by submission date, so don't assume which is first)
    const cards = page.locator('.listing-card h3');
    await expect(cards.first()).toBeVisible();
    const firstTitle = (await cards.first().textContent())?.trim() ?? '';
    expect(firstTitle.length).toBeGreaterThan(0);
    await page.fill('input[placeholder*="Search"]', firstTitle);
    // Fixtures intentionally contain a duplicate submission, so match first
    await expect(page.locator(`text=${firstTitle}`).first()).toBeVisible();
  });

  test('gallery has search and filter', async ({ page }) => {
    await page.goto('/events/sample-hack-2026/gallery');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });
});