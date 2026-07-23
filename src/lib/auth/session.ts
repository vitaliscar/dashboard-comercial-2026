export const SESSION_TTL_DAYS = 30;
export const SESSION_COOKIE_NAME = "ccv_session";

export function sessionExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
