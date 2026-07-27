import { describe, it, expect } from "vitest";
import {
  compararSnapshots,
  calcularParetoCobranzas,
  segmentarCobranzas,
} from "./cobranzas";

describe("cobranzas analytics", () => {
  describe("compararSnapshots", () => {
    it("debe retornar tieneHistorico: false cuando el snapshot anterior es null", () => {
      const actual = [
        { cliente: "Cliente A", facturaNumero: "F-001", saldo: 1000 },
        { cliente: "Cliente B", facturaNumero: "F-002", saldo: 500 },
      ];

      const res = compararSnapshots(actual, null);

      expect(res.tieneHistorico).toBe(false);
      expect(res.totalVencidoActual).toBe(1500);
      expect(res.totalVencidoAnterior).toBe(0);
      expect(res.deltaVencido).toBe(0);
      expect(res.clientesEmpeoraron).toEqual([]);
    });

    it("debe comparar actual vs anterior correctamente y reportar clientes que empeoraron", () => {
      const anterior = [
        { cliente: "Cliente A", facturaNumero: "F-001", saldo: 1000 },
        { cliente: "Cliente B", facturaNumero: "F-002", saldo: 2000 },
        { cliente: "Cliente C", facturaNumero: "F-003", saldo: 500 },
      ];

      const actual = [
        // Cliente A subió saldo de 1000 a 2500 (+1500)
        { cliente: "Cliente A", facturaNumero: "F-001", saldo: 1000 },
        { cliente: "Cliente A", facturaNumero: "F-004", saldo: 1500 },
        // Cliente B bajó de 2000 a 1000 (-1000)
        { cliente: "Cliente B", facturaNumero: "F-002", saldo: 1000 },
        // Cliente C subió de 500 a 800 (+300)
        { cliente: "Cliente C", facturaNumero: "F-003", saldo: 800 },
        // Cliente D es nuevo con 600 (+600)
        { cliente: "Cliente D", facturaNumero: "F-005", saldo: 600 },
      ];

      const res = compararSnapshots(actual, anterior);

      expect(res.tieneHistorico).toBe(true);
      expect(res.totalVencidoAnterior).toBe(3500); // 1000 + 2000 + 500
      expect(res.totalVencidoActual).toBe(4900); // 2500 + 1000 + 800 + 600
      expect(res.deltaVencido).toBe(1400); // 4900 - 3500

      // Solo deben incluirse los que empeoraron (delta > 0), ordenados por delta desc
      // A: +1500, D: +600, C: +300
      expect(res.clientesEmpeoraron).toHaveLength(3);
      expect(res.clientesEmpeoraron[0]).toEqual({
        cliente: "Cliente A",
        saldoActual: 2500,
        saldoAnterior: 1000,
        delta: 1500,
      });
      expect(res.clientesEmpeoraron[1]).toEqual({
        cliente: "Cliente D",
        saldoActual: 600,
        saldoAnterior: 0,
        delta: 600,
      });
      expect(res.clientesEmpeoraron[2]).toEqual({
        cliente: "Cliente C",
        saldoActual: 800,
        saldoAnterior: 500,
        delta: 300,
      });
    });

    it("debe limitar clientesEmpeoraron a los top 5", () => {
      const anterior = Array.from({ length: 10 }, (_, i) => ({
        cliente: `Cliente ${i + 1}`,
        saldo: 100,
      }));

      const actual = Array.from({ length: 10 }, (_, i) => ({
        cliente: `Cliente ${i + 1}`,
        saldo: 100 + (i + 1) * 50, // incremento
      }));

      const res = compararSnapshots(actual, anterior);
      expect(res.clientesEmpeoraron).toHaveLength(5);
      expect(res.clientesEmpeoraron[0].cliente).toBe("Cliente 10"); // +500
    });
  });

  describe("calcularParetoCobranzas", () => {
    it("debe agrupar por cliente, ordenar descendente y calcular porcentajes acumulados", () => {
      const rows = [
        { cliente: "Cliente A", saldo: 500 },
        { cliente: "Cliente B", saldo: 300 },
        { cliente: "Cliente A", saldo: 200 }, // Total A = 700
        { cliente: "Cliente C", saldo: 100 },
      ]; // Total general = 1100

      const pareto = calcularParetoCobranzas(rows);

      expect(pareto).toHaveLength(3);
      expect(pareto[0].cliente).toBe("Cliente A");
      expect(pareto[0].saldo).toBe(700);
      expect(pareto[0].porcentaje).toBeCloseTo((700 / 1100) * 100);
      expect(pareto[0].porcentajeAcumulado).toBeCloseTo((700 / 1100) * 100);
      expect(pareto[0].esTop80).toBe(true);

      expect(pareto[1].cliente).toBe("Cliente B");
      expect(pareto[1].saldo).toBe(300);

      expect(pareto[2].cliente).toBe("Cliente C");
      expect(pareto[2].saldo).toBe(100);
    });

    it("debe retornar arreglo vacío si todas las filas tienen saldo 0", () => {
      const rows = [{ cliente: "Cliente A", saldo: 0 }];
      expect(calcularParetoCobranzas(rows)).toEqual([]);
    });
  });

  describe("segmentarCobranzas", () => {
    it("debe agrupar totales por sucursal y por unidad de negocio", () => {
      const rows = [
        { sucursal: "Caracas", unidadNegocio: "Repuestos", saldo: 1000 },
        { sucursal: "Caracas", unidadNegocio: "Servicios", saldo: 500 },
        { sucursal: "Valencia", unidadNegocio: "Repuestos", saldo: 300 },
      ];

      const res = segmentarCobranzas(rows);

      expect(res.porSucursal).toEqual([
        { sucursal: "Caracas", total: 1500 },
        { sucursal: "Valencia", total: 300 },
      ]);

      expect(res.porUnidad).toEqual([
        { unidad: "Repuestos", total: 1300 },
        { unidad: "Servicios", total: 500 },
      ]);
    });
  });
});
