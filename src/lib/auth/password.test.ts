import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifyPassword succeeds for the original password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
  });

  it("verifyPassword fails for a wrong password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "wrong password")).toBe(false);
  });

  it("hashPassword produces a different hash each time (random salt)", async () => {
    const h1 = await hashPassword("same password");
    const h2 = await hashPassword("same password");
    expect(h1).not.toBe(h2);
  });
});
