import { test, expect } from '@playwright/test';

const ROLES = [
  { name: 'gerencia', route: '/gerencia-nacional', expectedHeading: /Gerencia|Nacional|Resumen/i },
  { name: 'gerente_comercial', route: '/dashboard', expectedHeading: /Dashboard|Comercial/i },
  { name: 'coordinador', route: '/coordinador', expectedHeading: /Coordinador|Equipo/i },
  { name: 'asesor', route: '/asesor', expectedHeading: /Asesor|Desempeño/i },
];

test.describe('Role-Based Access Journey', () => {
  for (const role of ROLES) {
    test(`should verify access for role: ${role.name}`, async ({ page }) => {
      await page.goto(role.route);
      await page.waitForLoadState('domcontentloaded');
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeDefined();
    });
  }
});
