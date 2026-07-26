import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
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
