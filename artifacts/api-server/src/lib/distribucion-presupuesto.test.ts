import assert from "node:assert/strict";
import test from "node:test";
import { proyectarMetaBaseDesdeVentas, type FilaBasePresupuesto } from "./distribucion-presupuesto";

function fila(mes: number, basePresupuesto: number, realBase: number): FilaBasePresupuesto {
  return {
    mes,
    sucursalId: "sucursal-1",
    sucursal: "Caracas",
    unidadNegocioId: "unidad-1",
    unidad: "Repuestos",
    basePresupuesto,
    realBase,
  };
}

test("anualiza las ventas de octubre a doce meses y conserva la mezcla del presupuesto", () => {
  const filas = [fila(1, 25, 1_000), fila(2, 75, 2_000)];
  const proyeccion = proyectarMetaBaseDesdeVentas(filas, 2026, new Date("2026-10-05T12:00:00Z"));

  assert.equal(proyeccion.ventaAcumulada, 3_000);
  assert.equal(proyeccion.mesesConsiderados, 10);
  assert.equal(proyeccion.metaBase, 3_600);
  assert.equal(proyeccion.metaMinima, 100);
  assert.equal(proyeccion.metodo, "proyeccion");
  assert.equal(proyeccion.filas.reduce((sum, row) => sum + row.basePresupuesto, 0), 3_600);
  assert.equal(proyeccion.filas[0].basePresupuesto, 900);
  assert.equal(proyeccion.filas[1].basePresupuesto, 2_700);
});

test("en noviembre anualiza el acumulado de once meses por doce", () => {
  const filas = Array.from({ length: 11 }, (_, index) => fila(index + 1, 100, 1_000));
  const proyeccion = proyectarMetaBaseDesdeVentas(filas, 2026, new Date("2026-11-05T12:00:00Z"));

  assert.equal(proyeccion.mesesConsiderados, 11);
  assert.equal(proyeccion.metaBase, 12_000);
  assert.equal(proyeccion.metodo, "proyeccion");
});

test("en diciembre usa el cierre real sin anualizar", () => {
  const filas = Array.from({ length: 12 }, (_, index) => fila(index + 1, 100, 1_000));
  const proyeccion = proyectarMetaBaseDesdeVentas(filas, 2026, new Date("2026-12-31T12:00:00Z"));

  assert.equal(proyeccion.ventaAcumulada, 12_000);
  assert.equal(proyeccion.metaBase, 12_000);
  assert.equal(proyeccion.metodo, "cierre");
});

test("usa el presupuesto como respaldo cuando no hay ventas registradas", () => {
  const proyeccion = proyectarMetaBaseDesdeVentas(
    [fila(1, 1_500, 0), fila(2, 2_500, 0)],
    2026,
    new Date("2026-10-05T12:00:00Z"),
  );

  assert.equal(proyeccion.metaBase, 4_000);
  assert.equal(proyeccion.metodo, "presupuesto");
});
