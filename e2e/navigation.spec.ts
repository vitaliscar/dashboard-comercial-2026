import { test, expect } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/gerencia-nacional",
  "/coordinador",
  "/asesor",
  "/asesores",
  "/sucursal",
  "/alertas",
  "/cobranzas",
  "/pareto",
  "/embudo",
  "/lubfiltros",
  "/repuestos",
  "/servicios",
  "/alquiler",
  "/cliente-360",
  "/simulador",
  "/comisiones",
];

test.describe("Navigation Journey across ported routes", () => {
  for (const route of ROUTES) {
    test(`should navigate to ${route} without 500 error`, async ({ page }) => {
      const response = await page.goto(route);
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
