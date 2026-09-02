import { describe, it, expect } from "vitest";
import { consolidarAsesores, calcularKPIs } from "./asesores";
import { VENTAS_CASA } from "../asesores-catalogo";

describe("Advisors Core Engine Tests", () => {
  const mockCumplimiento = [
    { codigo_asesor: "57995", asesor: "Felix Conde", venta: 15000, presupuesto: 12000 },
    { codigo_asesor: "80868", asesor: "Alfredo Betancourt", venta: 8000, presupuesto: 10000 },
    { codigo_asesor: "99999", asesor: "Desconocido", venta: 2000, presupuesto: 0 }, // Ventas Casa (unknown code)
  ];

  const mockCotizaciones = [
    { asesor_codigo: "57995", monto: 20000 }, // Felix Conde
    { asesor_codigo: "80868", monto: 10000 }, // Alfredo Betancourt
    { asesor_codigo: "99999", monto: 5000 }, // Ventas Casa (unknown code)
  ];

  const mockPerdidas = [
    { asesor: "Felix Conde", monto: 2000 },
    { asesor: "Unknown Broker", monto: 1000 }, // Ventas Casa
  ];

  const mockVentasCasaSucursal = [{ monto: 4000 }, { monto: 1000 }];

  it("should consolidate and group metrics correctly per advisor including Ventas Casa", () => {
    const result = consolidarAsesores(
      mockCumplimiento,
      mockCotizaciones,
      mockPerdidas,
      mockVentasCasaSucursal,
    );

    // Felix Conde (code 57995)
    const felix = result.find((a) => a.codigo === "57995")!;
    expect(felix).toBeDefined();
    expect(felix.venta).toBe(15000);
    expect(felix.cotizado).toBe(20000);
    expect(felix.perdido).toBe(2000);
    expect(felix.meta).toBe(12000);
    expect(felix.cumplimiento).toBe((15000 / 12000) * 100);
    expect(felix.conversion).toBe((15000 / 20000) * 100);

    // Alfredo Betancourt (code 80868)
    const alfredo = result.find((a) => a.codigo === "80868")!;
    expect(alfredo).toBeDefined();
    expect(alfredo.venta).toBe(8000);
    expect(alfredo.cotizado).toBe(10000);
    expect(alfredo.meta).toBe(10000);

    // Ventas Casa: código desconocido en cumplimiento (2000) + cotización con
    // código desconocido (5000) + venta perdida sin asesor reconocido (1000) +
    // ventas casa por sucursal (4000 + 1000)
    const casa = result.find((a) => a.codigo === VENTAS_CASA.codigo)!;
    expect(casa).toBeDefined();
    expect(casa.venta).toBe(2000 + 4000 + 1000);
    expect(casa.cotizado).toBe(5000);
    expect(casa.perdido).toBe(1000);
    expect(casa.meta).toBe(0);
  });

  it("should calculate correct KPIs from consolidated data", () => {
    const consolidated = consolidarAsesores(
      mockCumplimiento,
      mockCotizaciones,
      mockPerdidas,
      mockVentasCasaSucursal,
    );

    const kpi = calcularKPIs(consolidated);

    expect(kpi.totalFacturadoAsesores).toBe(23000); // Felix (15000) + Alfredo (8000)
    expect(kpi.totalFacturadoVentasCasa).toBe(7000); // 2000 + 4000 + 1000
    expect(kpi.totalPerdido).toBe(3000); // Felix (2000) + Unknown (1000)
    expect(kpi.cumplimientoPromedio).toBe(((15000 + 8000) / (12000 + 10000)) * 100); // (23000 / 22000) * 100 = 104.54%
    expect(kpi.asesoresSobreMeta).toBe(1); // Felix is 125%, Alfredo is 80%
    expect(kpi.totalAsesoresConMeta).toBe(2);
  });

  it("should route Visco Orinoco cotizaciones to Ventas Casa even when an advisor is listed", () => {
    const cotizacionesConVisco = [
      ...mockCotizaciones,
      { asesor_codigo: "57995", cliente: "Visco Orinoco", monto: 3000 },
    ];

    const result = consolidarAsesores(
      mockCumplimiento,
      cotizacionesConVisco,
      mockPerdidas,
      mockVentasCasaSucursal,
    );

    // Felix Conde should NOT receive the Visco Orinoco cotización.
    const felix = result.find((a) => a.codigo === "57995")!;
    expect(felix.cotizado).toBe(20000); // unchanged

    // Ventas Casa absorbs the Visco Orinoco amount on top of the existing unmatched rows.
    const casa = result.find((a) => a.codigo === VENTAS_CASA.codigo)!;
    expect(casa.cotizado).toBe(5000 + 3000);
  });

  it("should add ventas casa por sucursal directly to the Ventas Casa bucket", () => {
    const result = consolidarAsesores(
      [{ codigo_asesor: "57995", asesor: "Felix Conde", venta: 9000, presupuesto: 12000 }],
      [],
      [],
      [{ monto: 10000 }, { monto: 5000 }],
    );

    const felix = result.find((a) => a.codigo === "57995")!;
    expect(felix.venta).toBe(9000); // unaffected by ventas casa por sucursal

    const casa = result.find((a) => a.codigo === VENTAS_CASA.codigo)!;
    expect(casa.venta).toBe(15000); // 10000 + 5000
  });
});
