import autocannon from 'autocannon';

/**
 * Load Test Script for Dashboard Comercial 2026
 * Simulates 100 concurrent users against critical API routes and pages.
 */
async function runLoadTest() {
  const targetUrl = process.env.LOAD_TEST_URL || 'http://localhost:3000';
  console.log(`=======================================================`);
  console.log(`  STARTING LOAD TEST - 100 CONCURRENT USERS  `);
  console.log(`  Target URL: ${targetUrl}`);
  console.log(`=======================================================\n`);

  const result = await autocannon({
    url: targetUrl,
    connections: 100, // 100 concurrent connections
    duration: 10,     // 10 seconds test
    pipelining: 1,
    requests: [
      { path: '/', method: 'GET' },
      { path: '/api/health', method: 'GET' },
      { path: '/dashboard', method: 'GET' },
      { path: '/gerencia-nacional', method: 'GET' },
      { path: '/cobranzas', method: 'GET' },
      { path: '/alertas', method: 'GET' },
    ],
  });

  console.log(`\n=======================================================`);
  console.log(`  LOAD TEST RESULTS SUMMARY`);
  console.log(`=======================================================`);
  console.log(`Total Requests Sent : ${result.requests.total}`);
  console.log(`Requests / Sec     : ${result.requests.average}`);
  console.log(`Throughput         : ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`Latency Average    : ${result.latency.average} ms`);
  console.log(`Latency p50        : ${result.latency.p50} ms`);
  console.log(`Latency p95        : ${result.latency.p95} ms`);
  console.log(`Latency p99        : ${result.latency.p99} ms`);
  console.log(`2xx Responses      : ${result['2xx'] || 0}`);
  console.log(`Non-2xx Responses  : ${result.non2xx || 0}`);
  console.log(`Errors             : ${result.errors || 0}`);
  console.log(`Timeouts           : ${result.timeouts || 0}`);
  console.log(`=======================================================\n`);

  if (result.non2xx > 0 || result.errors > 0) {
    console.warn(`⚠️ Warning: Non-2xx responses or errors detected during load test.`);
  } else {
    console.log(`✅ Load test completed successfully with 0 errors.`);
  }

  return result;
}

runLoadTest().catch((err) => {
  console.error('Load test failed with exception:', err);
  process.exit(1);
});
