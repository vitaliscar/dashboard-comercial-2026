import { describe, it, expect } from "vitest";
import { computeChurn, type ChurnInputFactura } from "./churn";

describe("computeChurn", () => {
  it("cliente sin facturas en los últimos 6 meses entra en churn", () => {
    const hoy = new Date("2026-07-01");
    const facturas: ChurnInputFactura[] = [{ cliente: "PDVSA", fecha: "2025-10-01", monto: 100 }];
    const result = computeChurn(facturas, 6, hoy);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].esChurn).toBe(true);
    expect(result.clientesEnChurn).toBe(1);
    expect(result.churnRate).toBe(100);
  });

  it("cliente con factura reciente no entra en churn", () => {
    const hoy = new Date("2026-07-01");
    const facturas: ChurnInputFactura[] = [
      { cliente: "Cliente Activo", fecha: "2026-06-15", monto: 500 },
    ];
    const result = computeChurn(facturas, 6, hoy);

    expect(result.rows[0].esChurn).toBe(false);
    expect(result.churnRate).toBe(0);
  });

  it("usa la factura más reciente cuando hay varias del mismo cliente", () => {
    const hoy = new Date("2026-07-01");
    const facturas: ChurnInputFactura[] = [
      { cliente: "pdvsa", fecha: "2025-01-01", monto: 100 },
      { cliente: "PDVSA", fecha: "2026-06-01", monto: 200 },
    ];
    const result = computeChurn(facturas, 6, hoy);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].totalHistorico).toBe(300);
    expect(result.rows[0].esChurn).toBe(false);
  });

  it("churnRate 0 sobre lista vacía sin lanzar error", () => {
    const result = computeChurn([], 6, new Date("2026-07-01"));
    expect(result.clientesActivos).toBe(0);
    expect(result.churnRate).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("mezcla de clientes activos e inactivos calcula churnRate correcto", () => {
    const hoy = new Date("2026-07-01");
    const facturas: ChurnInputFactura[] = [
      { cliente: "Activo", fecha: "2026-06-01", monto: 100 },
      { cliente: "Inactivo1", fecha: "2025-01-01", monto: 100 },
      { cliente: "Inactivo2", fecha: "2025-02-01", monto: 100 },
    ];
    const result = computeChurn(facturas, 6, hoy);
    expect(result.clientesActivos).toBe(3);
    expect(result.clientesEnChurn).toBe(2);
    expect(result.churnRate).toBeCloseTo(66.67, 1);
  });
});
