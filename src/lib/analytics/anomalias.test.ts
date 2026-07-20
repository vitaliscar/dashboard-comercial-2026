import { describe, it, expect } from "vitest";
import { zScoreRobusto, detectarAnomaliasVenta, calcularRunRate } from "./anomalias";

describe("zScoreRobusto", () => {
  it("valor igual a la mediana tiene z-score 0", () => {
    expect(zScoreRobusto(100, [80, 90, 100, 110, 120])).toBe(0);
  });

  it("caída fuerte respecto al histórico produce z-score muy negativo", () => {
    const historico = [1000, 1050, 980, 1020, 1010, 990];
    const z = zScoreRobusto(50, historico);
    expect(z).toBeLessThan(-3.5);
  });

  it("serie sin variación (MAD 0) devuelve z-score 0 en vez de Infinity", () => {
    expect(zScoreRobusto(500, [1000, 1000, 1000])).toBe(0);
  });
});

describe("detectarAnomaliasVenta", () => {
  it("marca como anomalía un asesor con caída fuerte", () => {
    const result = detectarAnomaliasVenta([
      { asesor: "Juan", serieHistorica: [1000, 1050, 980, 1020, 1010, 990], ventaMesActual: 50 },
      { asesor: "Ana", serieHistorica: [500, 520, 480, 510], ventaMesActual: 505 },
    ]);
    const juan = result.find((r) => r.asesor === "Juan")!;
    const ana = result.find((r) => r.asesor === "Ana")!;
    expect(juan.esAnomalia).toBe(true);
    expect(ana.esAnomalia).toBe(false);
  });

  it("ordena por z-score ascendente (peores caídas primero)", () => {
    const result = detectarAnomaliasVenta([
      { asesor: "Estable", serieHistorica: [95, 100, 105, 98, 102], ventaMesActual: 100 },
      { asesor: "Caida", serieHistorica: [1000, 1050, 980, 1020, 1010], ventaMesActual: 10 },
    ]);
    expect(result[0].asesor).toBe("Caida");
  });
});

describe("calcularRunRate", () => {
  it("proyecta la venta de fin de mes al ritmo actual", () => {
    const result = calcularRunRate([
      {
        asesor: "Juan",
        ventaAcumuladaMes: 5000,
        diasTranscurridosMes: 10,
        diasTotalesMes: 30,
        metaMes: 20000,
      },
    ]);
    expect(result[0].runRate).toBe(15000);
    expect(result[0].cumplimientoProyectado).toBe(75);
    expect(result[0].enRiesgo).toBe(false);
  });

  it("marca en riesgo cuando la proyección cae bajo 70% de la meta", () => {
    const result = calcularRunRate([
      {
        asesor: "Ana",
        ventaAcumuladaMes: 1000,
        diasTranscurridosMes: 10,
        diasTotalesMes: 30,
        metaMes: 20000,
      },
    ]);
    expect(result[0].enRiesgo).toBe(true);
  });

  it("diasTranscurridosMes 0 no lanza error (división por cero evitada)", () => {
    const result = calcularRunRate([
      {
        asesor: "Nuevo",
        ventaAcumuladaMes: 0,
        diasTranscurridosMes: 0,
        diasTotalesMes: 30,
        metaMes: 1000,
      },
    ]);
    expect(result[0].runRate).toBe(0);
  });
});
