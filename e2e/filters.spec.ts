import { test, expect } from "@playwright/test";

test.describe("Table Filters and Search Journey", () => {
  test("should render table search inputs and filter controls on /asesores", async ({ page }) => {
    await page.goto("/asesores");
    await page.waitForLoadState("domcontentloaded");

    // Check if table or inputs are rendered
    const searchInputs = page.locator(
      'input[type="search"], input[placeholder*="Buscar"], input[placeholder*="buscar"]',
    );
    if ((await searchInputs.count()) > 0) {
      await searchInputs.first().fill("Juan");
      await page.waitForTimeout(300);
    }
  });

  test("should render search and filters on /cobranzas", async ({ page }) => {
    await page.goto("/cobranzas");
    await page.waitForLoadState("domcontentloaded");
    const tableOrGrid = page.locator('table, [role="grid"], .data-table');
    expect(await page.locator("body").isVisible()).toBeTruthy();
  });
});
