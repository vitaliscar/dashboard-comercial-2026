import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  requestId: string;
  userId?: string;
  route?: string;
  startTime: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function runWithTrace<T>(
  context: Partial<TraceContext>,
  fn: () => Promise<T> | T
): Promise<T> | T {
  const fullContext: TraceContext = {
    requestId: context.requestId || generateRequestId(),
    userId: context.userId,
    route: context.route,
    startTime: context.startTime || Date.now(),
  };

  return traceStorage.run(fullContext, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}
