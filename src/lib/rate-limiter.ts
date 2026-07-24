import { logger } from "./logger";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class MemoryRateLimiter {
  private requests: Map<string, RateLimitRecord> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = 60 * 1000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Periodic cleanup of expired rate limit keys
    setInterval(() => this.cleanup(), this.windowMs);
  }

  isRateLimited(identifier: string): {
    limited: boolean;
    current: number;
    remaining: number;
    resetMs: number;
  } {
    const now = Date.now();
    const record = this.requests.get(identifier);

    if (!record || now > record.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return {
        limited: false,
        current: 1,
        remaining: this.maxRequests - 1,
        resetMs: this.windowMs,
      };
    }

    record.count++;
    if (record.count > this.maxRequests) {
      logger.warn(
        `[Rate Limit Exceeded] IP/User ${identifier} sent ${record.count} reqs in ${this.windowMs}ms`,
      );
      return {
        limited: true,
        current: record.count,
        remaining: 0,
        resetMs: record.resetTime - now,
      };
    }

    return {
      limited: false,
      current: record.count,
      remaining: this.maxRequests - record.count,
      resetMs: record.resetTime - now,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

export const apiRateLimiter = new MemoryRateLimiter(60 * 1000, 100); // 100 reqs/min standard
export const authRateLimiter = new MemoryRateLimiter(15 * 60 * 1000, 10); // 10 login attempts/15min
