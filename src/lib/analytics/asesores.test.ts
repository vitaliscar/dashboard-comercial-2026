import { describe, it, expect } from "vitest";
import { consolidarAsesores, calcularKPIs, prepararDatosPareto } from "./asesores";
import { VENTAS_CASA } from "../asesores-catalogo";

describe("Advisors Core Engine Tests", () => {
  const mockFacturas = [
    { asesor: "Felix Conde", monto: 10000 },
    { asesor: "CONDE FELIX", monto: 5000 },
    { asesor: "ADMIN", monto: 2000 }, // Ventas Casa
    { asesor: "Alfredo Betancourt", monto: 8000 },
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

  const mockMetas = [
    { codigo_asesor: "57995", asesor: "Felix Conde", presupuesto: 12000 },
    { codigo_asesor: "80868", asesor: "Alfredo Betancourt", presupuesto: 10000 },
  ];

  it("should consolidate and group metrics correctly per advisor including Ventas Casa", () => {
    const result = consolidarAsesores(mockFacturas, mockCotizaciones, mockPerdidas, mockMetas);

    // Felix Conde (code 57995)
    const felix = result.find((a) => a.codigo === "57995")!;
    expect(felix).toBeDefined();
    expect(felix.venta).toBe(15000); // 10000 + 5000
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

    // Ventas Casa
    const casa = result.find((a) => a.codigo === VENTAS_CASA.codigo)!;
    expect(casa).toBeDefined();
    expect(casa.venta).toBe(2000); // ADMIN factura
    expect(casa.cotizado).toBe(5000); // code 99999 cotizacion
    expect(casa.perdido).toBe(1000); // Unknown Broker perdida
    expect(casa.meta).toBe(0);
  });

  it("should calculate correct KPIs from consolidated data", () => {
    const consolidated = consolidarAsesores(
      mockFacturas,
      mockCotizaciones,
      mockPerdidas,
      mockMetas,
    );

    const kpi = calcularKPIs(consolidated);

    expect(kpi.totalFacturadoAsesores).toBe(23000); // Felix (15000) + Alfredo (8000)
    expect(kpi.totalFacturadoVentasCasa).toBe(2000); // ADMIN (2000)
    expect(kpi.totalPerdido).toBe(3000); // Felix (2000) + Unknown (1000)
    expect(kpi.cumplimientoPromedio).toBe(((15000 + 8000) / (12000 + 10000)) * 100); // (23000 / 22000) * 100 = 104.54%
    expect(kpi.asesoresSobreMeta).toBe(1); // Felix is 125%, Alfredo is 80%
    expect(kpi.totalAsesoresConMeta).toBe(2);
  });

  it("should prepare and sort Pareto data correctly", () => {
    const consolidated = consolidarAsesores(
      mockFacturas,
      mockCotizaciones,
      mockPerdidas,
      mockMetas,
    );

    const paretoVenta = prepararDatosPareto(consolidated, "venta");

    expect(paretoVenta.length).toBe(3); // Felix, Alfredo, Ventas Casa
    expect(paretoVenta[0].name).toBe("Felix Conde");
    expect(paretoVenta[0].value).toBe(15000);
    expect(paretoVenta[1].name).toBe("Alfredo Betancourt");
    expect(paretoVenta[1].value).toBe(8000);
    expect(paretoVenta[2].name).toBe("Ventas Casa");
    expect(paretoVenta[2].value).toBe(2000);
  });
});
