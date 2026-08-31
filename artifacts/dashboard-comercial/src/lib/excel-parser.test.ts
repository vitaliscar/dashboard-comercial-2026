import { describe, it, expect } from "vitest";
import { parseFechaDDMMYYYY } from "@/lib/excel-parser";

describe("parseFechaDDMMYYYY", () => {
  it("convierte DD-MM-YYYY a ISO", () => {
    expect(parseFechaDDMMYYYY("31-07-2026")).toBe("2026-07-31");
  });

  it("acepta separador con slash", () => {
    expect(parseFechaDDMMYYYY("01/12/2025")).toBe("2025-12-01");
  });

  it("devuelve null para vacío, undefined o formato distinto", () => {
    expect(parseFechaDDMMYYYY("")).toBeNull();
    expect(parseFechaDDMMYYYY(undefined)).toBeNull();
    expect(parseFechaDDMMYYYY("2026-07-31")).toBeNull();
  });
});
