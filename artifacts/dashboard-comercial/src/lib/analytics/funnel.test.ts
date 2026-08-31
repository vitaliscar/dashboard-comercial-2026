import { describe, it, expect } from "vitest";
import {
  computeFunnel,
  computeFunnelTotals,
  type FunnelInputCotizacion,
  type FunnelInputFactura,
  type FunnelInputVentaPerdida,
  type FunnelInputCobranza,
} from "./funnel";

describe("computeFunnel", () => {
  it("cliente con cotización 100, factura 80, pérdida 20, cobro 70 → tasas correctas", () => {
    const cots: FunnelInputCotizacion[] = [{ cliente: "PDVSA", asesor_codigo: "001", monto: 100 }];
    const facts: FunnelInputFactura[] = [{ cliente: "pdvsa", asesor: "Juan", monto: 80 }];
    const perds: FunnelInputVentaPerdida[] = [{ cliente: "PDVSA", asesor: "Juan", monto: 20 }];
    const cobs: FunnelInputCobranza[] = [{ cliente: "pdvsa", monto: 80, saldo: 10 }];

    const result = computeFunnel(cots, facts, perds, cobs, "cliente");

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.cotizado).toBe(100);
    expect(row.facturado).toBe(80);
    expect(row.perdido).toBe(20);
    expect(row.cobrado).toBe(70);
    expect(row.tasaConversion).toBe(80);
    expect(row.tasaPerdida).toBe(20);
    expect(row.tasaCobro).toBeCloseTo(87.5, 1);
  });

  it("cliente con cotización pero sin factura → tasa conversión 0", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "ClienteNuevo", asesor_codigo: "002", monto: 50 },
    ];
    const result = computeFunnel(cots, [], [], [], "cliente");

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.cotizado).toBe(50);
    expect(row.facturado).toBe(0);
    expect(row.tasaConversion).toBe(0);
    expect(row.tasaCobro).toBe(100);
  });

  it("cliente con factura pero sin cobranzas → tasa cobro 100% (asumido)", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "ClienteSinCobranza", asesor_codigo: "003", monto: 200 },
    ];
    const facts: FunnelInputFactura[] = [
      { cliente: "ClienteSinCobranza", asesor: "Maria", monto: 150 },
    ];
    const result = computeFunnel(cots, facts, [], [], "cliente");

    const row = result.rows[0];
    expect(row.facturado).toBe(150);
    expect(row.cobrado).toBe(150);
    expect(row.tasaCobro).toBe(100);
  });

  it("normaliza acentos y mayúsculas en el match de cliente", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "CAJA VENEZOLANA", asesor_codigo: "001", monto: 100 },
    ];
    const facts: FunnelInputFactura[] = [{ cliente: "caja venezolana", asesor: "Juan", monto: 90 }];
    const result = computeFunnel(cots, facts, [], [], "cliente");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].facturado).toBe(90);
  });

  it("dim asesor sin mapa de codigo → usa codigo como key", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "Cliente A", asesor_codigo: "001", monto: 100 },
    ];
    const facts: FunnelInputFactura[] = [{ cliente: "Cliente A", asesor: "Juan", monto: 80 }];
    const result = computeFunnel(cots, facts, [], [], "asesor");

    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.key === "001")?.cotizado).toBe(100);
    expect(result.rows.find((r) => r.key === "juan")?.facturado).toBe(80);
  });

  it("dim asesor con mapa de codigo → resuelve al nombre", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "Cliente A", asesor_codigo: "001", monto: 100 },
    ];
    const facts: FunnelInputFactura[] = [{ cliente: "Cliente A", asesor: "Juan", monto: 80 }];
    const mapa = new Map([["001", "Juan"]]);
    const result = computeFunnel(cots, facts, [], [], "asesor", mapa);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].key).toBe("juan");
    expect(result.rows[0].cotizado).toBe(100);
    expect(result.rows[0].facturado).toBe(80);
  });

  it("totales globales se calculan correctamente", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "A", asesor_codigo: "001", monto: 100 },
      { cliente: "B", asesor_codigo: "002", monto: 200 },
    ];
    const facts: FunnelInputFactura[] = [
      { cliente: "A", asesor: "X", monto: 80 },
      { cliente: "B", asesor: "Y", monto: 150 },
    ];
    const result = computeFunnel(cots, facts, [], [], "cliente");

    expect(result.totales.cotizado).toBe(300);
    expect(result.totales.facturado).toBe(230);
    expect(result.conversionGlobal).toBeCloseTo(76.67, 1);
  });

  it("rows ordenadas por facturado descendente", () => {
    const cots: FunnelInputCotizacion[] = [
      { cliente: "Pequeno", asesor_codigo: "001", monto: 50 },
      { cliente: "Grande", asesor_codigo: "002", monto: 100 },
    ];
    const facts: FunnelInputFactura[] = [
      { cliente: "Pequeno", asesor: "X", monto: 40 },
      { cliente: "Grande", asesor: "Y", monto: 90 },
    ];
    const result = computeFunnel(cots, facts, [], [], "cliente");

    expect(result.rows[0].key).toBe("grande");
    expect(result.rows[1].key).toBe("pequeno");
  });

  it("entrada vacía → summary con ceros", () => {
    const result = computeFunnel([], [], [], [], "cliente");

    expect(result.rows).toHaveLength(0);
    expect(result.totales.cotizado).toBe(0);
    expect(result.conversionGlobal).toBe(0);
    expect(result.cobroGlobal).toBe(100);
  });
});

describe("computeFunnelTotals", () => {
  it("calcula totales correctos con datos de presupuestos", () => {
    const result = computeFunnelTotals({
      totalCotizado: 1000,
      totalFacturadoPresupuestos: 800,
      totalSaldoCobranzas: 100,
    });

    expect(result.cotizado).toBe(1000);
    expect(result.facturado).toBe(800);
    expect(result.cobrado).toBe(700);
    expect(result.tasaConversion).toBe(80);
    expect(result.tasaCobro).toBeCloseTo(87.5, 1);
  });

  it("cotizado = 0 → tasas en 0", () => {
    const result = computeFunnelTotals({
      totalCotizado: 0,
      totalFacturadoPresupuestos: 500,
      totalSaldoCobranzas: 50,
    });

    expect(result.tasaConversion).toBe(0);
    expect(result.cobrado).toBe(450);
  });

  it("facturado = 0 → tasa cobro 100%", () => {
    const result = computeFunnelTotals({
      totalCotizado: 1000,
      totalFacturadoPresupuestos: 0,
      totalSaldoCobranzas: 0,
    });

    expect(result.tasaConversion).toBe(0);
    expect(result.tasaCobro).toBe(100);
    expect(result.cobrado).toBe(0);
  });

  it("saldo > facturado → cobrado = 0 (no negativo)", () => {
    const result = computeFunnelTotals({
      totalCotizado: 1000,
      totalFacturadoPresupuestos: 500,
      totalSaldoCobranzas: 800,
    });

    expect(result.cobrado).toBe(0);
  });
});
