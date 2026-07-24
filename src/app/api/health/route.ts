import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import os from 'os';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'healthy';
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - dbStart;
  } catch (error) {
    dbStatus = `unhealthy: ${error instanceof Error ? error.message : String(error)}`;
  }

  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpuLoad = os.loadavg();

  const isHealthy = dbStatus === 'healthy';
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      latencyMs: Date.now() - startTime,
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        memory: {
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          systemFreeMb: Math.round(freeMem / 1024 / 1024),
          systemTotalMb: Math.round(totalMem / 1024 / 1024),
        },
        cpu: {
          loadAvg1m: cpuLoad[0],
          loadAvg5m: cpuLoad[1],
          loadAvg15m: cpuLoad[2],
          cores: os.cpus().length,
        },
      },
    },
    { status: statusCode }
  );
}
