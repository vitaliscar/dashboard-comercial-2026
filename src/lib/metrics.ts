import os from 'os';

interface LatencyRecord {
  timestamp: number;
  duration: number;
}

class SystemMetricsCollector {
  private requestCount = 0;
  private error500Count = 0;
  private latencies: LatencyRecord[] = [];
  private dbActivePool = 0;
  private maxDbPoolSize = 20;

  recordRequest(statusCode: number, durationMs: number) {
    this.requestCount++;
    if (statusCode >= 500) {
      this.error500Count++;
    }
    this.latencies.push({ timestamp: Date.now(), duration: durationMs });

    // Keep rolling window of last 1000 requests (or last 10 minutes)
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  setDbPoolStatus(active: number, max: number = 20) {
    this.dbActivePool = active;
    this.maxDbPoolSize = max;
  }

  getRecentLatencies(windowMs = 60000): number[] {
    const cutoff = Date.now() - windowMs;
    return this.latencies
      .filter((l) => l.timestamp >= cutoff)
      .map((l) => l.duration)
      .sort((a, b) => a - b);
  }

  getPercentileLatency(percentile: number, windowMs = 60000): number {
    const sorted = this.getRecentLatencies(windowMs);
    if (!sorted.length) return 0;
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  getErrorRate(windowMs = 60000): number {
    const cutoff = Date.now() - windowMs;
    const recent = this.latencies.filter((l) => l.timestamp >= cutoff);
    if (!recent.length) return 0;
    return (this.error500Count / recent.length) * 100;
  }

  getSystemStatus() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsagePct = (((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2);

    // Estimate load average / CPU usage
    const loadAvg = os.loadavg();
    const cpuUsagePct = ((loadAvg[0] / cpus.length) * 100).toFixed(2);

    const p95 = this.getPercentileLatency(95);
    const p99 = this.getPercentileLatency(99);

    return {
      timestamp: new Date().toISOString(),
      cpuUsagePct: parseFloat(cpuUsagePct),
      memoryUsagePct: parseFloat(memoryUsagePct),
      totalRequests: this.requestCount,
      errors500: this.error500Count,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      dbConnectionPool: {
        active: this.dbActivePool,
        max: this.maxDbPoolSize,
        saturationPct: parseFloat(((this.dbActivePool / this.maxDbPoolSize) * 100).toFixed(2)),
      },
    };
  }

  toPrometheusFormat(): string {
    const status = this.getSystemStatus();
    return `
# HELP http_requests_total Total number of HTTP requests processed
# TYPE http_requests_total counter
http_requests_total ${status.totalRequests}

# HELP http_errors_500_total Total 500 status code server errors
# TYPE http_errors_500_total counter
http_errors_500_total ${status.errors500}

# HELP http_request_duration_p95_ms p95 latency in milliseconds
# TYPE http_request_duration_p95_ms gauge
http_request_duration_p95_ms ${status.p95LatencyMs}

# HELP http_request_duration_p99_ms p99 latency in milliseconds
# TYPE http_request_duration_p99_ms gauge
http_request_duration_p99_ms ${status.p99LatencyMs}

# HELP system_cpu_usage_percent CPU utilization percentage
# TYPE system_cpu_usage_percent gauge
system_cpu_usage_percent ${status.cpuUsagePct}

# HELP system_memory_usage_percent RAM memory utilization percentage
# TYPE system_memory_usage_percent gauge
system_memory_usage_percent ${status.memoryUsagePct}

# HELP db_pool_active_connections Current active DB pool connections
# TYPE db_pool_active_connections gauge
db_pool_active_connections ${status.dbConnectionPool.active}
    `.trim();
  }
}

export const metrics = new SystemMetricsCollector();
