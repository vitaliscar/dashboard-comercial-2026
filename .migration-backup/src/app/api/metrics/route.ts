import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { timingSafeEqual } from "crypto";
import { apiRateLimiter } from "@/lib/rate-limiter";

function authorizeMetrics(request: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    // Sin token configurado: denegar en producción; permitir en desarrollo local.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const queryToken = request.nextUrl.searchParams.get("token");
  const provided = bearer || queryToken;
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limit = apiRateLimiter.isRateLimited(`metrics:${ip}`);
  if (limit.limited) {
    return new NextResponse("rate limited", { status: 429 });
  }

  if (!authorizeMetrics(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const cpus = os.cpus().length;
  const load = os.loadavg()[0];

  const metrics = `
# HELP node_uptime_seconds Process uptime in seconds
# TYPE node_uptime_seconds gauge
node_uptime_seconds ${uptime.toFixed(2)}

# HELP node_memory_rss_bytes Process Resident Set Size in bytes
# TYPE node_memory_rss_bytes gauge
node_memory_rss_bytes ${mem.rss}

# HELP node_memory_heap_used_bytes Process Heap Used in bytes
# TYPE node_memory_heap_used_bytes gauge
node_memory_heap_used_bytes ${mem.heapUsed}

# HELP node_cpu_load_1m CPU 1-minute load average
# TYPE node_cpu_load_1m gauge
node_cpu_load_1m ${load.toFixed(2)}

# HELP node_cpu_cores Total CPU cores
# TYPE node_cpu_cores gauge
node_cpu_cores ${cpus}
`.trim();

  return new NextResponse(metrics, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4",
    },
  });
}
