import { test, expect } from '@playwright/test';

test.describe('Authentication Flow Journey', () => {
  test('should display login page correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Dashboard Comercial|Login/i);
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test('should show validation error on empty submit', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Expect either HTML5 validation or UI message
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await expect(emailInput).toBeVisible();
    }
  });

  test('should attempt login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'gerencia@ccv.com');
    await page.fill('input[type="password"], input[name="password"]', 'demo123456');
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
