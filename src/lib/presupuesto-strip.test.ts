import { describe, expect, it } from "vitest";
import { agruparPresupuestoPorUnidad, type PresupuestoRow } from "./presupuesto-strip";

const unidades = [
  { id: "srv", nombre: "Servicios" },
  { id: "rep", nombre: "Repuestos" },
  { id: "alq", nombre: "Alquiler" },
];

const rows: PresupuestoRow[] = [
  { mes: 1, sucursalId: "s1", unidadNegocioId: "rep", meta: "100", facturado: "50" },
  { mes: 2, sucursalId: "s1", unidadNegocioId: "rep", meta: "100", facturado: "150" },
  { mes: 1, sucursalId: "s2", unidadNegocioId: "srv", meta: "40", facturado: "10" },
  { mes: 3, sucursalId: "s2", unidadNegocioId: "srv", meta: "40", facturado: "10" },
  { mes: 1, sucursalId: "s1", unidadNegocioId: null, meta: "999", facturado: "999" },
];

describe("agruparPresupuestoPorUnidad", () => {
  it("suma por unidad, ordena y calcula el total", () => {
    const r = agruparPresupuestoPorUnidad(rows, { meses: [1, 2, 3], sucursalIds: [] }, unidades);
    expect(r.unidades.map((u) => u.label)).toEqual(["Repuestos", "Servicios"]);
    expect(r.unidades[0]).toMatchObject({ meta: 200, facturado: 200, pct: 100 });
    expect(r.total).toEqual({ meta: 280, facturado: 220, pct: (220 / 280) * 100 });
  });

  it("respeta el filtro de meses", () => {
    const r = agruparPresupuestoPorUnidad(rows, { meses: [1], sucursalIds: [] }, unidades);
    expect(r.total.meta).toBe(140);
  });

  it("respeta el filtro de sucursal", () => {
    const r = agruparPresupuestoPorUnidad(
      rows,
      { meses: [1, 2, 3], sucursalIds: ["s2"] },
      unidades,
    );
    expect(r.unidades.map((u) => u.id)).toEqual(["srv"]);
    expect(r.total.meta).toBe(80);
  });

  it("sin datos devuelve total 0 y pct 0", () => {
    const r = agruparPresupuestoPorUnidad([], { meses: [1], sucursalIds: [] }, unidades);
    expect(r).toEqual({ unidades: [], total: { meta: 0, facturado: 0, pct: 0 } });
  });
});
