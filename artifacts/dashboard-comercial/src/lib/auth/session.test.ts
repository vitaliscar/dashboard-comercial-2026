import { describe, it, expect } from "vitest";
import { sessionExpiryDate, isSessionExpired, SESSION_TTL_DAYS } from "./session";

describe("session", () => {
  it("sessionExpiryDate adds SESSION_TTL_DAYS to the reference date", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const expiry = sessionExpiryDate(from);
    const diffDays = (expiry.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(SESSION_TTL_DAYS);
  });

  it("isSessionExpired returns true when expiry is in the past", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const expiresAt = new Date("2026-01-01T00:00:00Z");
    expect(isSessionExpired(expiresAt, now)).toBe(true);
  });

  it("isSessionExpired returns false when expiry is in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiresAt = new Date("2026-02-01T00:00:00Z");
    expect(isSessionExpired(expiresAt, now)).toBe(false);
  });

  it("isSessionExpired treats an expiry exactly at `now` as expired", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isSessionExpired(now, now)).toBe(true);
  });
});
