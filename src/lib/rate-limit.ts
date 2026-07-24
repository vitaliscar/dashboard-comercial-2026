interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const tracker = new Map<string, RateLimitRecord>();

/**
 * In-memory Rate Limiter
 * @param key Identifier (e.g. IP address or userId)
 * @param limit Maximum allowed requests in window
 * @param windowMs Window duration in milliseconds (default: 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000,
): { success: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = tracker.get(key);

  if (!record || now > record.resetTime) {
    const resetTime = now + windowMs;
    tracker.set(key, { count: 1, resetTime });
    return { success: true, remaining: limit - 1, resetTime };
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count += 1;
  return { success: true, remaining: limit - record.count, resetTime: record.resetTime };
}
