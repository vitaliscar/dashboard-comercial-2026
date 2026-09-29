import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarPremisas, validarPremisas, premisaGlobalLegacy, type Premisa } from "./premisas";

test("aplicarPremisas: suma global + override por unidad", () => {
  const premisas: Premisa[] = [
    { tipo: "crecimiento_pct", alcance: "global", alcanceId: null, mes: null, valor: 5 },
    { tipo: "crecimiento_pct", alcance: "unidad", alcanceId: "repuestos-id", mes: null, valor: 3 },
  ];
  const repuestos = aplicarPremisas({ mes: 1, sucursalId: null, unidadNegocioId: "repuestos-id", base: 1000 }, premisas);
  const otra = aplicarPremisas({ mes: 1, sucursalId: null, unidadNegocioId: "servicios-id", base: 1000 }, premisas);
  assert.equal(repuestos, 1080); // +5% +3% = +8%
  assert.equal(otra, 1050); // solo +5% global
});

test("aplicarPremisas: ajuste fijo se suma después del %, nunca da negativo", () => {
  const premisas: Premisa[] = [
    { tipo: "crecimiento_pct", alcance: "global", alcanceId: null, mes: null, valor: -100 },
    { tipo: "ajuste_fijo", alcance: "global", alcanceId: null, mes: null, valor: -500 },
  ];
  const resultado = aplicarPremisas({ mes: 3, sucursalId: null, unidadNegocioId: null, base: 1000 }, premisas);
  assert.equal(resultado, 0);
});

test("validarPremisas: descarta filas fuera de rango y respeta compat legada", () => {
  const validas = validarPremisas([{ tipo: "crecimiento_pct", alcance: "global", valor: 5000 }, { tipo: "crecimiento_pct", alcance: "global", valor: 10 }]);
  assert.equal(validas.length, 1);
  assert.equal(validas[0]?.valor, 10);
  assert.deepEqual(premisaGlobalLegacy(7), [
    { tipo: "crecimiento_pct", alcance: "global", alcanceId: null, mes: null, valor: 7 },
  ]);
});
