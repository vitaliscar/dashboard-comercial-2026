import { logger } from './logger';

export interface TraceSpan {
  traceId: string;
  name: string;
  startTime: number;
  end: (metadata?: Record<string, unknown>) => void;
}

/**
 * Lightweight OpenTelemetry-compatible tracing helper for Server Actions & API endpoints
 */
export function startTrace(spanName: string): TraceSpan {
  const traceId = `trace_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
  const startTime = performance.now();

  return {
    traceId,
    name: spanName,
    startTime,
    end: (metadata = {}) => {
      const duration = performance.now() - startTime;
      logger.info({
        message: `[TRACE] ${spanName}`,
        traceId,
        durationMs: Number(duration.toFixed(2)),
        ...metadata,
      });
    },
  };
}
