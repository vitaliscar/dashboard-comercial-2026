import { logger } from "./logger";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimitResult {
  limited: boolean;
  current: number;
  remaining: number;
  resetMs: number;
}

function createRateLimiter(windowMs = 60 * 1000, maxRequests = 100) {
  const requests = new Map<string, RateLimitRecord>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests.entries()) {
      if (now > record.resetTime) {
        requests.delete(key);
      }
    }
  }, windowMs);

  return {
    isRateLimited(identifier: string): RateLimitResult {
      const now = Date.now();
      const record = requests.get(identifier);

      if (!record || now > record.resetTime) {
        requests.set(identifier, { count: 1, resetTime: now + windowMs });
        return { limited: false, current: 1, remaining: maxRequests - 1, resetMs: windowMs };
      }

      record.count++;
      if (record.count > maxRequests) {
        logger.warn(
          `[Rate Limit Exceeded] IP/User ${identifier} sent ${record.count} reqs in ${windowMs}ms`,
        );
        return { limited: true, current: record.count, remaining: 0, resetMs: record.resetTime - now };
      }

      return {
        limited: false,
        current: record.count,
        remaining: maxRequests - record.count,
        resetMs: record.resetTime - now,
      };
    },
  };
}

export const apiRateLimiter = createRateLimiter(60 * 1000, 100); // 100 reqs/min standard
export const authRateLimiter = createRateLimiter(15 * 60 * 1000, 10); // 10 login attempts/15min
