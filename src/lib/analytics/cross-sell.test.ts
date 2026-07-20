import { describe, it, expect } from "vitest";
import {
  computeAfinidadUnidades,
  computeNextBestOffers,
  type CrossSellInputTransaccion,
} from "./cross-sell";

describe("computeAfinidadUnidades", () => {
  it("calcula soporte/confianza/lift para un par de unidades siempre co-compradas", () => {
    const tx: CrossSellInputTransaccion[] = [
      { cliente: "A", unidad_negocio_id: "u1" },
      { cliente: "A", unidad_negocio_id: "u2" },
      { cliente: "B", unidad_negocio_id: "u1" },
      { cliente: "B", unidad_negocio_id: "u2" },
    ];
    const result = computeAfinidadUnidades(tx);
    const par = result.find((r) => r.unidadA === "u1" && r.unidadB === "u2")!;
    expect(par.soporte).toBe(1); // 2/2 clientes tienen ambas
    expect(par.confianza).toBe(1); // 2/2 clientes con u1 también tienen u2
    expect(par.lift).toBe(1); // no hay levantamiento: u2 aparece siempre de todas formas
  });

  it("lift > 1 cuando la co-ocurrencia es más frecuente que el azar", () => {
    const tx: CrossSellInputTransaccion[] = [
      { cliente: "A", unidad_negocio_id: "u1" },
      { cliente: "A", unidad_negocio_id: "u2" },
      { cliente: "B", unidad_negocio_id: "u1" },
      { cliente: "B", unidad_negocio_id: "u2" },
      { cliente: "C", unidad_negocio_id: "u3" },
      { cliente: "D", unidad_negocio_id: "u3" },
    ];
    const result = computeAfinidadUnidades(tx);
    const par = result.find((r) => r.unidadA === "u1" && r.unidadB === "u2")!;
    expect(par.lift).toBeGreaterThan(1);
  });

  it("lista vacía devuelve array vacío sin lanzar error", () => {
    expect(computeAfinidadUnidades([])).toHaveLength(0);
  });
});

describe("computeNextBestOffers", () => {
  it("sugiere unidades que el cliente no compra, ordenadas por lift", () => {
    const tx: CrossSellInputTransaccion[] = [
      { cliente: "A", unidad_negocio_id: "u1" },
      { cliente: "A", unidad_negocio_id: "u2" },
      { cliente: "B", unidad_negocio_id: "u1" },
      { cliente: "B", unidad_negocio_id: "u2" },
      { cliente: "C", unidad_negocio_id: "u1" }, // C no tiene u2 -> candidato
    ];
    const sugerencias = computeNextBestOffers(tx, 3);
    const paraC = sugerencias.filter((s) => s.cliente === "C");
    expect(paraC.length).toBeGreaterThan(0);
    expect(paraC[0].unidadSugerida).toBe("u2");
  });

  it("no sugiere unidades que el cliente ya compra", () => {
    const tx: CrossSellInputTransaccion[] = [
      { cliente: "A", unidad_negocio_id: "u1" },
      { cliente: "A", unidad_negocio_id: "u2" },
    ];
    const sugerencias = computeNextBestOffers(tx, 3);
    const paraA = sugerencias.filter((s) => s.cliente === "A");
    expect(paraA.every((s) => s.unidadSugerida !== "u1" && s.unidadSugerida !== "u2")).toBe(true);
  });

  it("respeta el límite topN de sugerencias por cliente", () => {
    const tx: CrossSellInputTransaccion[] = [
      { cliente: "A", unidad_negocio_id: "u1" },
      { cliente: "B", unidad_negocio_id: "u1" },
      { cliente: "B", unidad_negocio_id: "u2" },
      { cliente: "C", unidad_negocio_id: "u1" },
      { cliente: "C", unidad_negocio_id: "u3" },
      { cliente: "D", unidad_negocio_id: "u1" },
      { cliente: "D", unidad_negocio_id: "u4" },
    ];
    const sugerencias = computeNextBestOffers(tx, 1);
    const paraA = sugerencias.filter((s) => s.cliente === "A");
    expect(paraA.length).toBeLessThanOrEqual(1);
  });
});
