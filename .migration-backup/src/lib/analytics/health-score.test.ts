import { describe, it, expect } from "vitest";
import { computeHealthScore, healthBand, DEFAULT_REFS } from "./health-score";

describe("computeHealthScore", () => {
  it("cliente sin riesgo y con LTV alto obtiene el score máximo (100, clamp)", () => {
    const score = computeHealthScore({
      diasVencidoMax: 0,
      saldoVencido: 0,
      recenciaDias: 0,
      montoPerdidoReciente: 0,
      ltv: DEFAULT_REFS.ltvRef,
    });
    expect(score).toBe(100);
  });

  it("cliente con mora máxima en todos los factores y sin LTV cae al piso", () => {
    const score = computeHealthScore({
      diasVencidoMax: DEFAULT_REFS.diasVencidoRef * 2,
      saldoVencido: DEFAULT_REFS.saldoVencidoRef * 2,
      recenciaDias: DEFAULT_REFS.recenciaRef * 2,
      montoPerdidoReciente: DEFAULT_REFS.montoPerdidoRef * 2,
      ltv: 0,
    });
    expect(score).toBe(15); // 100 - 25 - 25 - 20 - 15 + 0
  });

  it("score nunca es negativo ni mayor a 100", () => {
    const score = computeHealthScore({
      diasVencidoMax: 1_000_000,
      saldoVencido: 1_000_000,
      recenciaDias: 1_000_000,
      montoPerdidoReciente: 1_000_000,
      ltv: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("healthBand", () => {
  it("clasifica >= 70 como sano", () => {
    expect(healthBand(70)).toBe("sano");
    expect(healthBand(100)).toBe("sano");
  });

  it("clasifica 40-69 como atención", () => {
    expect(healthBand(40)).toBe("atencion");
    expect(healthBand(69)).toBe("atencion");
  });

  it("clasifica < 40 como riesgo", () => {
    expect(healthBand(39.9)).toBe("riesgo");
    expect(healthBand(0)).toBe("riesgo");
  });
});
