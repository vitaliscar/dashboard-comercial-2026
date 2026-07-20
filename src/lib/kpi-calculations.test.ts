/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * KPI Calculations - Unit Tests
 * Test specifications for all calculation functions
 * Uses Vitest with AAA (Arrange-Act-Assert) pattern
 */

import { describe, it, expect } from "vitest";
import {
  calcularCumplimiento,
  calcularPareto,
  agruparPorSucursal,
  agruparPorUN,
  calcularVariacion,
  rankingAsesores,
  carteraVencida,
  calcularEstadisticas,
  filtrarPorFecha,
  calcularCrecimiento,
} from "./kpi-calculations";

// ============================================================================
// CUMPLIMIENTO TESTS
// ============================================================================

describe("calcularCumplimiento", () => {
  it("should return success status when compliance is 100% or above", () => {
    // Arrange
    const presupuesto = 100000;
    const venta = 100000;

    // Act
    const resultado = calcularCumplimiento(presupuesto, venta);

    // Assert
    expect(resultado.porcentaje).toBe(100);
    expect(resultado.estado).toBe("success");
  });

  it("should return warning status when compliance is 70-99%", () => {
    // Arrange
    const presupuesto = 100000;
    const venta = 85000;

    // Act
    const resultado = calcularCumplimiento(presupuesto, venta);

    // Assert
    expect(resultado.porcentaje).toBe(85);
    expect(resultado.estado).toBe("warning");
  });

  it("should return danger status when compliance is below 70%", () => {
    // Arrange
    const presupuesto = 100000;
    const venta = 50000;

    // Act
    const resultado = calcularCumplimiento(presupuesto, venta);

    // Assert
    expect(resultado.porcentaje).toBe(50);
    expect(resultado.estado).toBe("danger");
  });

  it("should handle zero presupuesto gracefully", () => {
    // Arrange
    const presupuesto = 0;
    const venta = 50000;

    // Act
    const resultado = calcularCumplimiento(presupuesto, venta);

    // Assert
    expect(resultado.porcentaje).toBe(0);
    expect(resultado.estado).toBe("danger");
  });

  it("should handle null values", () => {
    // Arrange
    const presupuesto = null as any;
    const venta = 50000;

    // Act
    const resultado = calcularCumplimiento(presupuesto, venta);

    // Assert
    expect(resultado.estado).toBe("danger");
  });
});

// ============================================================================
// PARETO TESTS
// ============================================================================

describe("calcularPareto", () => {
  it("should identify top 80% items correctly", () => {
    // Arrange
    const datos = [
      { nombre: "A", ventas: 50000 },
      { nombre: "B", ventas: 30000 },
      { nombre: "C", ventas: 15000 },
      { nombre: "D", ventas: 5000 },
    ];

    // Act
    const resultado = calcularPareto(datos, "ventas");

    // Assert
    const top80 = resultado.filter((r) => r.esTop80);
    expect(top80.length).toBeGreaterThan(0);
    expect(top80[0].item.nombre).toBe("A"); // Highest value first
  });

  it("should calculate cumulative percentages correctly", () => {
    // Arrange
    const datos = [
      { nombre: "A", ventas: 100 },
      { nombre: "B", ventas: 100 },
    ];

    // Act
    const resultado = calcularPareto(datos, "ventas");

    // Assert
    expect(resultado[0].porcentajeAcumulado).toBe(50);
    expect(resultado[1].porcentajeAcumulado).toBe(100);
  });

  it("should handle empty array", () => {
    // Arrange
    const datos: any[] = [];

    // Act
    const resultado = calcularPareto(datos, "ventas");

    // Assert
    expect(resultado).toEqual([]);
  });

  it("should sort by value descending", () => {
    // Arrange
    const datos = [
      { id: 1, valor: 10 },
      { id: 2, valor: 50 },
      { id: 3, valor: 30 },
    ];

    // Act
    const resultado = calcularPareto(datos, "valor");

    // Assert
    expect(resultado[0].valor).toBe(50);
    expect(resultado[1].valor).toBe(30);
    expect(resultado[2].valor).toBe(10);
  });
});

// ============================================================================
// GROUPING TESTS
// ============================================================================

describe("agruparPorSucursal", () => {
  it("should group by branch and sum correctly", () => {
    // Arrange
    const datos = [
      { sucursal: "Caracas", monto: 100000 },
      { sucursal: "Caracas", monto: 50000 },
      { sucursal: "Valencia", monto: 75000 },
    ];

    // Act
    const resultado = agruparPorSucursal(datos, "sucursal", "monto");

    // Assert
    expect(resultado.length).toBe(2);
    expect(resultado[0].nombre).toBe("Caracas");
    expect(resultado[0].total).toBe(150000);
    expect(resultado[0].cantidad).toBe(2);
  });

  it("should calculate averages correctly", () => {
    // Arrange
    const datos = [
      { sucursal: "Test", monto: 100 },
      { sucursal: "Test", monto: 200 },
    ];

    // Act
    const resultado = agruparPorSucursal(datos, "sucursal", "monto");

    // Assert
    expect(resultado[0].promedio).toBe(150);
  });

  it("should sort by total descending", () => {
    // Arrange
    const datos = [
      { sucursal: "A", monto: 50 },
      { sucursal: "B", monto: 100 },
      { sucursal: "C", monto: 75 },
    ];

    // Act
    const resultado = agruparPorSucursal(datos, "sucursal", "monto");

    // Assert
    expect(resultado[0].nombre).toBe("B");
    expect(resultado[1].nombre).toBe("C");
    expect(resultado[2].nombre).toBe("A");
  });

  it("should handle empty array", () => {
    // Arrange
    const datos: any[] = [];

    // Act
    const resultado = agruparPorSucursal(datos, "sucursal", "monto");

    // Assert
    expect(resultado).toEqual([]);
  });
});

describe("agruparPorUN", () => {
  it("should group by business unit", () => {
    // Arrange
    const datos = [
      { unidad_negocio: "Ventas", monto: 100000 },
      { unidad_negocio: "Ventas", monto: 50000 },
      { unidad_negocio: "Servicios", monto: 75000 },
    ];

    // Act
    const resultado = agruparPorUN(datos);

    // Assert
    expect(resultado.length).toBe(2);
    expect(resultado[0].nombre).toBe("Ventas");
    expect(resultado[0].total).toBe(150000);
  });
});

// ============================================================================
// VARIATION TESTS
// ============================================================================

describe("calcularVariacion", () => {
  it("should calculate positive variation correctly", () => {
    // Arrange
    const anterior = 100000;
    const actual = 120000;

    // Act
    const resultado = calcularVariacion(anterior, actual);

    // Assert
    expect(resultado.porcentaje).toBe(20);
    expect(resultado.diferencia).toBe(20000);
    expect(resultado.tendencia).toBe("arriba");
  });

  it("should calculate negative variation correctly", () => {
    // Arrange
    const anterior = 100000;
    const actual = 80000;

    // Act
    const resultado = calcularVariacion(anterior, actual);

    // Assert
    expect(resultado.porcentaje).toBe(-20);
    expect(resultado.diferencia).toBe(-20000);
    expect(resultado.tendencia).toBe("abajo");
  });

  it("should mark small changes as stable", () => {
    // Arrange
    const anterior = 100000;
    const actual = 100500; // 0.5% change

    // Act
    const resultado = calcularVariacion(anterior, actual);

    // Assert
    expect(resultado.tendencia).toBe("estable");
  });

  it("should handle zero anterior value", () => {
    // Arrange
    const anterior = 0;
    const actual = 100000;

    // Act
    const resultado = calcularVariacion(anterior, actual);

    // Assert
    expect(resultado.porcentaje).toBe(100);
  });

  it("should handle both zero values", () => {
    // Arrange
    const anterior = 0;
    const actual = 0;

    // Act
    const resultado = calcularVariacion(anterior, actual);

    // Assert
    expect(resultado.porcentaje).toBe(0);
    expect(resultado.tendencia).toBe("estable");
  });
});

// ============================================================================
// RANKING TESTS
// ============================================================================

describe("rankingAsesores", () => {
  it("should rank advisors by sales descending", () => {
    // Arrange
    const datos = [
      { id: "1", nombre: "Juan", venta: 100000 },
      { id: "2", nombre: "María", venta: 150000 },
      { id: "3", nombre: "Carlos", venta: 120000 },
    ];

    // Act
    const resultado = rankingAsesores(datos);

    // Assert
    expect(resultado[0].nombre).toBe("María");
    expect(resultado[0].posicion).toBe(1);
    expect(resultado[1].nombre).toBe("Carlos");
    expect(resultado[1].posicion).toBe(2);
    expect(resultado[2].nombre).toBe("Juan");
    expect(resultado[2].posicion).toBe(3);
  });

  it("should handle empty array", () => {
    // Arrange
    const datos: any[] = [];

    // Act
    const resultado = rankingAsesores(datos);

    // Assert
    expect(resultado).toEqual([]);
  });

  it("should filter out invalid sales values", () => {
    // Arrange
    const datos = [
      { id: "1", nombre: "Juan", venta: 100000 },
      { id: "2", nombre: "María", venta: NaN },
      { id: "3", nombre: "Carlos", venta: 120000 },
    ];

    // Act
    const resultado = rankingAsesores(datos);

    // Assert
    expect(resultado.length).toBe(2);
    expect(resultado.map((r) => r.nombre)).toContain("Juan");
    expect(resultado.map((r) => r.nombre)).toContain("Carlos");
    expect(resultado.map((r) => r.nombre)).not.toContain("María");
  });
});

// ============================================================================
// OVERDUE ACCOUNTS TESTS
// ============================================================================

describe("carteraVencida", () => {
  it("should filter accounts overdue by threshold", () => {
    // Arrange
    const cuentas = [
      { id: "1", nombre: "Cliente A", dias_vencimiento: 5, monto: 50000 },
      { id: "2", nombre: "Cliente B", dias_vencimiento: 30, monto: 75000 },
      { id: "3", nombre: "Cliente C", dias_vencimiento: 16, monto: 100000 },
    ];

    // Act
    const resultado = carteraVencida(cuentas, 15);

    // Assert
    expect(resultado.length).toBe(2); // Cliente B (30) and Cliente C (16) — más de 15 días
    expect(resultado[0].nombre).toBe("Cliente B"); // Sorted descending
  });

  it("should mark accounts as vencida correctly", () => {
    // Arrange
    const cuentas = [{ id: "1", nombre: "Test", dias_vencimiento: 20, monto: 100 }];

    // Act
    const resultado = carteraVencida(cuentas, 15);

    // Assert
    expect(resultado[0].vencida).toBe(true);
  });

  it("should sort by dias_vencimiento descending", () => {
    // Arrange
    const cuentas = [
      { id: "1", nombre: "A", dias_vencimiento: 30, monto: 100 },
      { id: "2", nombre: "B", dias_vencimiento: 45, monto: 100 },
      { id: "3", nombre: "C", dias_vencimiento: 20, monto: 100 },
    ];

    // Act
    const resultado = carteraVencida(cuentas, 15);

    // Assert
    expect(resultado[0].nombre).toBe("B");
    expect(resultado[1].nombre).toBe("A");
    expect(resultado[2].nombre).toBe("C");
  });

  it("should handle empty array", () => {
    // Arrange
    const cuentas: any[] = [];

    // Act
    const resultado = carteraVencida(cuentas, 15);

    // Assert
    expect(resultado).toEqual([]);
  });
});

// ============================================================================
// STATISTICS TESTS
// ============================================================================

describe("calcularEstadisticas", () => {
  it("should calculate min, max, average, total correctly", () => {
    // Arrange
    const valores = [100, 200, 150, 300];

    // Act
    const resultado = calcularEstadisticas(valores);

    // Assert
    expect(resultado.min).toBe(100);
    expect(resultado.max).toBe(300);
    expect(resultado.promedio).toBe(187.5);
    expect(resultado.total).toBe(750);
    expect(resultado.cantidad).toBe(4);
  });

  it("should handle empty array", () => {
    // Arrange
    const valores: number[] = [];

    // Act
    const resultado = calcularEstadisticas(valores);

    // Assert
    expect(resultado.min).toBe(0);
    expect(resultado.max).toBe(0);
    expect(resultado.total).toBe(0);
  });

  it("should filter out NaN values", () => {
    // Arrange
    const valores = [100, NaN, 200];

    // Act
    const resultado = calcularEstadisticas(valores);

    // Assert
    expect(resultado.cantidad).toBe(2);
    expect(resultado.promedio).toBe(150);
  });
});

// ============================================================================
// DATE FILTERING TESTS
// ============================================================================

describe("filtrarPorFecha", () => {
  it("should filter records within date range", () => {
    // Arrange
    const datos = [
      { fecha: "2024-01-15", monto: 100 },
      { fecha: "2024-01-20", monto: 150 },
      { fecha: "2024-02-05", monto: 200 },
    ];

    // Act
    const resultado = filtrarPorFecha(datos, "2024-01-01", "2024-01-31");

    // Assert
    expect(resultado.length).toBe(2);
    expect(resultado.map((r) => r.monto)).toContain(100);
    expect(resultado.map((r) => r.monto)).toContain(150);
  });

  it("should handle Date objects", () => {
    // Arrange
    const datos = [{ fecha: "2024-01-15", monto: 100 }];
    const inicio = new Date("2024-01-01");
    const fin = new Date("2024-01-31");

    // Act
    const resultado = filtrarPorFecha(datos, inicio, fin);

    // Assert
    expect(resultado.length).toBe(1);
  });

  it("should handle empty array", () => {
    // Arrange
    const datos: any[] = [];

    // Act
    const resultado = filtrarPorFecha(datos, "2024-01-01", "2024-01-31");

    // Assert
    expect(resultado).toEqual([]);
  });
});

// ============================================================================
// GROWTH RATE TESTS
// ============================================================================

describe("calcularCrecimiento", () => {
  it("should calculate growth percentage correctly", () => {
    // Arrange
    const periodoAnterior = [100, 200];
    const periodoPosterior = [110, 220];

    // Act
    const resultado = calcularCrecimiento(periodoAnterior, periodoPosterior);

    // Assert
    expect(resultado.porcentaje).toBe(10);
    expect(resultado.estado).toBe("arriba");
  });

  it("should mark decline as negative growth", () => {
    // Arrange
    const periodoAnterior = [100, 200];
    const periodoPosterior = [90, 180];

    // Act
    const resultado = calcularCrecimiento(periodoAnterior, periodoPosterior);

    // Assert
    expect(resultado.porcentaje).toBe(-10);
    expect(resultado.estado).toBe("abajo");
  });

  it("should handle zero anterior period", () => {
    // Arrange
    const periodoAnterior = [0, 0];
    const periodoPosterior = [100, 100];

    // Act
    const resultado = calcularCrecimiento(periodoAnterior, periodoPosterior);

    // Assert
    expect(resultado.estado).toBe("arriba");
  });

  it("should mark small changes as stable", () => {
    // Arrange
    const periodoAnterior = [100, 100];
    const periodoPosterior = [100.5, 100.3];

    // Act
    const resultado = calcularCrecimiento(periodoAnterior, periodoPosterior);

    // Assert
    expect(resultado.estado).toBe("estable");
  });
});
