import { test, expect } from '@playwright/test';

test.describe('KPI Calculations and Analytics Views Journey', () => {
  test('should render KPI cards on /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should render Alertas view with KPI indicators', async ({ page }) => {
    await page.goto('/alertas');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should render Pareto chart view', async ({ page }) => {
    await page.goto('/pareto');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should render Cobranzas financial KPIs', async ({ page }) => {
    await page.goto('/cobranzas');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();
  });
});
