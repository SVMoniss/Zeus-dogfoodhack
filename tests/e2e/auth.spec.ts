import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('organizer can login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'organizer@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*events/);
  });

  test('judge can login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'judge_a@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*events/);
  });

  test('participant can login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'participant@dogfood.local');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*events/);
  });

  test('invalid credentials rejected', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'invalid@dogfood.local');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});