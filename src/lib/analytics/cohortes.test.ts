import { describe, it, expect } from "vitest";
import { computeCohortes, type CohorteInputFactura } from "./cohortes";

describe("computeCohortes", () => {
  it("agrupa clientes por mes de primera factura", () => {
    const facturas: CohorteInputFactura[] = [
      { cliente: "A", fecha: "2026-01-10", monto: 100 },
      { cliente: "B", fecha: "2026-01-20", monto: 100 },
      { cliente: "C", fecha: "2026-02-05", monto: 100 },
    ];
    const cohortes = computeCohortes(facturas, 3);
    expect(cohortes).toHaveLength(2);
    expect(cohortes[0].cohorte).toBe("2026-01");
    expect(cohortes[0].tamano).toBe(2);
    expect(cohortes[1].cohorte).toBe("2026-02");
    expect(cohortes[1].tamano).toBe(1);
  });

  it("retención en offset 0 es siempre 100%", () => {
    const facturas: CohorteInputFactura[] = [
      { cliente: "A", fecha: "2026-01-10", monto: 100 },
      { cliente: "B", fecha: "2026-01-20", monto: 100 },
    ];
    const cohortes = computeCohortes(facturas, 3);
    expect(cohortes[0].retencionPorOffset[0]).toBe(100);
  });

  it("cliente que no vuelve a facturar tiene retención 0 en offsets posteriores", () => {
    const facturas: CohorteInputFactura[] = [
      { cliente: "A", fecha: "2026-01-10", monto: 100 },
      { cliente: "B", fecha: "2026-01-20", monto: 100 },
      { cliente: "B", fecha: "2026-02-05", monto: 100 },
    ];
    const cohortes = computeCohortes(facturas, 3);
    // Cohorte 2026-01 tiene 2 clientes; solo B factura en offset 1 -> 50%.
    expect(cohortes[0].retencionPorOffset[1]).toBe(50);
  });

  it("NRR en offset 0 es siempre 100%", () => {
    const facturas: CohorteInputFactura[] = [{ cliente: "A", fecha: "2026-01-10", monto: 500 }];
    const cohortes = computeCohortes(facturas, 2);
    expect(cohortes[0].nrrPorOffset[0]).toBe(100);
  });

  it("NRR > 100% cuando el revenue del offset supera al mes base (expansión)", () => {
    const facturas: CohorteInputFactura[] = [
      { cliente: "A", fecha: "2026-01-10", monto: 100 },
      { cliente: "A", fecha: "2026-02-10", monto: 300 },
    ];
    const cohortes = computeCohortes(facturas, 2);
    expect(cohortes[0].nrrPorOffset[1]).toBe(300);
  });

  it("lista vacía devuelve sin cohortes", () => {
    expect(computeCohortes([], 3)).toHaveLength(0);
  });
});
