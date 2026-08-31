import { describe, it, expect } from "vitest";
import {
  computeLeadsResumen,
  computeEmbudoEstatus,
  type LeadRow,
} from "@/lib/analytics/clientes-potenciales";

const lead = (p: Partial<LeadRow>): LeadRow => ({
  estatusBis: "Nuevo",
  etapaOportunidad: null,
  ingresosEsperados: 0,
  montoFacturadoBase: 0,
  ...p,
});

describe("computeLeadsResumen", () => {
  it("suma monto facturado solo con Convertidos + Cerrado ganado", () => {
    const rows = [
      lead({
        estatusBis: "Convertidos",
        etapaOportunidad: "Cerrado ganado",
        montoFacturadoBase: 100,
      }),
      lead({ estatusBis: "Convertidos", etapaOportunidad: "Desarrollo", montoFacturadoBase: 999 }),
      lead({
        estatusBis: "Cerrado perdido",
        etapaOportunidad: "Cerrado ganado",
        montoFacturadoBase: 999,
      }),
    ];
    expect(computeLeadsResumen(rows).montoFacturado).toBe(100);
  });

  it("suma monto en orden de venta solo con Convertidos + Propuesta-Negociación", () => {
    const rows = [
      lead({
        estatusBis: "Convertidos",
        etapaOportunidad: "Propuesta-Negociación",
        ingresosEsperados: 250,
      }),
      lead({
        estatusBis: "Convertidos",
        etapaOportunidad: "Cerrado ganado",
        ingresosEsperados: 999,
      }),
      lead({
        estatusBis: "En proceso",
        etapaOportunidad: "Propuesta-Negociación",
        ingresosEsperados: 999,
      }),
    ];
    expect(computeLeadsResumen(rows).montoOrdenVenta).toBe(250);
  });

  it("cuenta total, nuevos y convertidos, y calcula la tasa de conversión", () => {
    const rows = [
      lead({ estatusBis: "Nuevo" }),
      lead({ estatusBis: "Nuevo" }),
      lead({ estatusBis: "Convertidos" }),
      lead({ estatusBis: "En proceso" }),
    ];
    const r = computeLeadsResumen(rows);
    expect(r.total).toBe(4);
    expect(r.nuevos).toBe(2);
    expect(r.convertidos).toBe(1);
    expect(r.tasaConversion).toBe(25);
  });

  it("no divide por cero cuando no hay leads", () => {
    const r = computeLeadsResumen([]);
    expect(r.total).toBe(0);
    expect(r.tasaConversion).toBe(0);
    expect(r.montoFacturado).toBe(0);
    expect(r.montoOrdenVenta).toBe(0);
  });
});

describe("computeEmbudoEstatus", () => {
  it("devuelve los estatus en orden de embudo, omitiendo los que no tienen filas", () => {
    const rows = [
      lead({ estatusBis: "Convertidos" }),
      lead({ estatusBis: "Nuevo" }),
      lead({ estatusBis: "Nuevo" }),
    ];
    expect(computeEmbudoEstatus(rows)).toEqual([
      { estatus: "Nuevo", cantidad: 2 },
      { estatus: "Convertidos", cantidad: 1 },
    ]);
  });

  it("agrupa los estatus nulos o desconocidos bajo 'Desconocido'", () => {
    expect(computeEmbudoEstatus([lead({ estatusBis: null })])).toEqual([
      { estatus: "Desconocido", cantidad: 1 },
    ]);
  });
});
