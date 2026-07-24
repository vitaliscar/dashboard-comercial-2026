/**
 * Smoke Test Script for Dashboard Comercial 2026
 * Verifies that all 12+ ported Next.js routes and role views load correctly without 500 errors.
 */

const ROUTES_TO_TEST = [
  '/',
  '/api/health',
  '/api/metrics',
  '/dashboard',
  '/gerencia-nacional',
  '/coordinador',
  '/asesor',
  '/asesores',
  '/sucursal',
  '/alertas',
  '/cobranzas',
  '/pareto',
  '/embudo',
  '/lubfiltros',
  '/repuestos',
  '/servicios',
  '/alquiler',
  '/cliente-360',
  '/simulador',
  '/comisiones',
];

async function runSmokeTest() {
  const baseUrl = process.env.STAGING_URL || 'http://localhost:3000';
  console.log(`=======================================================`);
  console.log(`  RUNNING SMOKE TESTS ON STAGING / LOCAL              `);
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`=======================================================\n`);

  let passed = 0;
  let failed = 0;

  for (const route of ROUTES_TO_TEST) {
    const url = `${baseUrl}${route}`;
    try {
      const start = Date.now();
      const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'SmokeTestRunner/1.0' } });
      const duration = Date.now() - start;

      if (res.status < 500) {
        console.log(`[PASS] ${route.padEnd(25)} Status: ${res.status} (${duration}ms)`);
        passed++;
      } else {
        console.error(`[FAIL] ${route.padEnd(25)} Status: ${res.status} (${duration}ms) - SERVER ERROR`);
        failed++;
      }
    } catch (err) {
      console.error(`[ERROR] ${route.padEnd(25)} Failed to reach endpoint: ${err}`);
      failed++;
    }
  }

  console.log(`\n=======================================================`);
  console.log(`  SMOKE TEST SUMMARY`);
  console.log(`=======================================================`);
  console.log(`Total Routes Tested: ${ROUTES_TO_TEST.length}`);
  console.log(`Passed (Status < 500): ${passed}`);
  console.log(`Failed (Status >= 500): ${failed}`);
  console.log(`=======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTest();
