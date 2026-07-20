import { describe, it, expect } from "vitest";
import { computeLtv, type LtvInputTransaccion } from "./ltv";

describe("computeLtv", () => {
  it("calcula LTV histórico como la suma de montos del cliente", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Cliente A", fecha: "2026-01-01", monto: 100, unidad_negocio_id: "u1" },
      { cliente: "Cliente A", fecha: "2026-02-01", monto: 200, unidad_negocio_id: "u1" },
    ];
    const result = computeLtv(tx, 0.05);
    expect(result).toHaveLength(1);
    expect(result[0].ltvHistorico).toBe(300);
  });

  it("cuenta unidades distintas y calcula penetración sobre el total de unidades del dataset", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Cliente A", fecha: "2026-01-01", monto: 100, unidad_negocio_id: "u1" },
      { cliente: "Cliente A", fecha: "2026-01-15", monto: 50, unidad_negocio_id: "u2" },
      { cliente: "Cliente B", fecha: "2026-01-01", monto: 100, unidad_negocio_id: "u3" },
    ];
    const result = computeLtv(tx, 0.05);
    const clienteA = result.find((r) => r.cliente === "Cliente A")!;
    expect(clienteA.nUnidades).toBe(2);
    expect(clienteA.penetracion).toBeCloseTo(2 / 3, 3);
  });

  it("ventaMensualPromedio divide entre meses activos distintos, no entre transacciones", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Cliente A", fecha: "2026-01-05", monto: 100, unidad_negocio_id: "u1" },
      { cliente: "Cliente A", fecha: "2026-01-20", monto: 100, unidad_negocio_id: "u1" },
    ];
    const result = computeLtv(tx, 0.05);
    // Mismo mes (enero) -> 1 mes activo, no 2.
    expect(result[0].mesesActivo).toBe(1);
    expect(result[0].ventaMensualPromedio).toBe(200);
  });

  it("ltvProyectado = ventaMensualPromedio * (1/churnRateMensual)", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Cliente A", fecha: "2026-01-01", monto: 1000, unidad_negocio_id: "u1" },
    ];
    const result = computeLtv(tx, 0.1); // vida esperada = 10 meses
    expect(result[0].ltvProyectado).toBe(1000 * 10);
  });

  it("churnRateMensual 0 usa un cap razonable en vez de dividir por cero", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Cliente A", fecha: "2026-01-01", monto: 100, unidad_negocio_id: "u1" },
    ];
    const result = computeLtv(tx, 0);
    expect(Number.isFinite(result[0].ltvProyectado)).toBe(true);
  });

  it("ordena por LTV histórico descendente", () => {
    const tx: LtvInputTransaccion[] = [
      { cliente: "Bajo", fecha: "2026-01-01", monto: 50, unidad_negocio_id: "u1" },
      { cliente: "Alto", fecha: "2026-01-01", monto: 500, unidad_negocio_id: "u1" },
    ];
    const result = computeLtv(tx, 0.05);
    expect(result[0].cliente).toBe("Alto");
    expect(result[1].cliente).toBe("Bajo");
  });
});
