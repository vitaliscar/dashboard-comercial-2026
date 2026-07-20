/**
 * KPI Calculations Library
 * Pure functions for commercial dashboard calculations
 * All calculations are immutable and type-safe
 */

/**
 * Cumplimiento/compliance data structure
 */
export interface CumplimientoResult {
  porcentaje: number;
  estado: "success" | "warning" | "danger";
  variacion: number;
}

/**
 * Pareto analysis result
 */
export interface ParetoItem<T> {
  item: T;
  valor: number;
  porcentajeValor: number;
  porcentajeAcumulado: number;
  esTop80: boolean;
}

/**
 * Grouped result with aggregation
 */
export interface GroupedResult {
  nombre: string;
  total: number;
  cantidad: number;
  promedio: number;
}

/**
 * Advisor ranking
 */
export interface AsesoresRanking {
  id: string;
  nombre: string;
  venta: number;
  posicion: number;
}

/**
 * Overdue account
 */
export interface CuentaVencida {
  id: string;
  nombre: string;
  diasVencimiento: number;
  monto: number;
  vencida: boolean;
}

/**
 * Variation calculation result
 */
export interface VariacionResult {
  anterior: number;
  actual: number;
  diferencia: number;
  porcentaje: number;
  tendencia: "arriba" | "abajo" | "estable";
}

/**
 * Calculates compliance percentage
 * @param presupuesto - Budget amount
 * @param venta - Actual sales
 * @returns Compliance result with percentage, status, and variation
 * @example
 * const result = calcularCumplimiento(100000, 85000);
 * // { porcentaje: 85, estado: "warning", variacion: 0 }
 */
export function calcularCumplimiento(presupuesto: number, venta: number): CumplimientoResult {
  if (!presupuesto || presupuesto <= 0) {
    return { porcentaje: 0, estado: "danger", variacion: 0 };
  }

  const porcentaje = (venta / presupuesto) * 100;
  const estado = porcentaje >= 100 ? "success" : porcentaje >= 70 ? "warning" : "danger";

  return {
    porcentaje: Math.round(porcentaje * 100) / 100,
    estado,
    variacion: 0,
  };
}

/**
 * Performs Pareto analysis (80/20 rule)
 * Identifies top items that represent 80% of the total value
 * @param datos - Array of items with values
 * @param campo - Property name containing the numeric value
 * @returns Sorted Pareto analysis with cumulative percentages
 * @example
 * const items = [
 *   { nombre: "Producto A", ventas: 5000 },
 *   { nombre: "Producto B", ventas: 3000 },
 *   { nombre: "Producto C", ventas: 2000 }
 * ];
 * const pareto = calcularPareto(items, "ventas");
 * // Shows which items make up 80% of revenue
 */
export function calcularPareto<T extends Record<string, unknown>>(
  datos: T[],
  campo: string,
): ParetoItem<T>[] {
  if (!datos || datos.length === 0) return [];

  // Validate that all items have the field
  const valoresValidos = datos.map((item) => {
    const valor = item[campo] as number;
    return typeof valor === "number" && !Number.isNaN(valor) ? valor : 0;
  });

  const total = valoresValidos.reduce((sum, val) => sum + val, 0);

  if (total === 0) return [];

  // Sort descending and calculate cumulative percentages
  const conIndices = datos.map((item, idx) => ({
    item,
    valor: valoresValidos[idx],
    indiceOriginal: idx,
  }));

  const ordenado = conIndices.sort((a, b) => b.valor - a.valor);

  let acumulado = 0;
  const resultado: ParetoItem<T>[] = [];

  for (const { item, valor } of ordenado) {
    acumulado += valor;
    const porcentajeValor = (valor / total) * 100;
    const porcentajeAcumulado = (acumulado / total) * 100;

    resultado.push({
      item,
      valor,
      porcentajeValor: Math.round(porcentajeValor * 100) / 100,
      porcentajeAcumulado: Math.round(porcentajeAcumulado * 100) / 100,
      esTop80: porcentajeAcumulado <= 80,
    });
  }

  return resultado;
}

/**
 * Groups data by a field and aggregates numeric values
 * @param datos - Array of items to group
 * @param campo - Property name to group by
 * @param campoValor - Optional numeric property to sum (defaults to summing all numeric properties)
 * @returns Grouped results with totals and averages
 * @example
 * const ventas = [
 *   { sucursal: "Caracas", monto: 100000 },
 *   { sucursal: "Caracas", monto: 50000 },
 *   { sucursal: "Valencia", monto: 75000 }
 * ];
 * const grouped = agruparPorSucursal(ventas, "sucursal", "monto");
 */
export function agruparPorSucursal<T extends Record<string, unknown>>(
  datos: T[],
  campo: string,
  campoValor?: string,
): GroupedResult[] {
  if (!datos || datos.length === 0) return [];

  const grupos = new Map<string, { total: number; cantidad: number }>();

  for (const item of datos) {
    const clave = String(item[campo] ?? "Sin asignar");
    const valor = campoValor
      ? (item[campoValor] as number)
      : Object.values(item).reduce(
          (sum: number, val) => sum + (typeof val === "number" ? val : 0),
          0,
        );

    if (!Number.isNaN(valor) && typeof valor === "number") {
      const actual = grupos.get(clave) ?? { total: 0, cantidad: 0 };
      grupos.set(clave, {
        total: actual.total + valor,
        cantidad: actual.cantidad + 1,
      });
    }
  }

  const resultado: GroupedResult[] = Array.from(grupos.entries()).map(
    ([nombre, { total, cantidad }]) => ({
      nombre,
      total,
      cantidad,
      promedio: Math.round((total / cantidad) * 100) / 100,
    }),
  );

  return resultado.sort((a, b) => b.total - a.total);
}

/**
 * Groups data by business unit (unidad_negocio)
 * @param datos - Array of items to group
 * @returns Grouped results by business unit
 * @example
 * const transacciones = [
 *   { unidad_negocio: "Ventas", monto: 100000 },
 *   { unidad_negocio: "Servicios", monto: 50000 }
 * ];
 * const porUN = agruparPorUN(transacciones);
 */
export function agruparPorUN<T extends Record<string, unknown>>(datos: T[]): GroupedResult[] {
  return agruparPorSucursal(datos, "unidad_negocio");
}

/**
 * Calculates percentage change between two values
 * @param anterior - Previous value
 * @param actual - Current value
 * @returns Variation with percentage change and trend
 * @example
 * const var = calcularVariacion(100000, 120000);
 * // { anterior: 100000, actual: 120000, diferencia: 20000, porcentaje: 20, tendencia: "arriba" }
 */
export function calcularVariacion(anterior: number, actual: number): VariacionResult {
  if (anterior === 0 && actual === 0) {
    return {
      anterior,
      actual,
      diferencia: 0,
      porcentaje: 0,
      tendencia: "estable",
    };
  }

  const diferencia = actual - anterior;
  const porcentaje = anterior !== 0 ? (diferencia / anterior) * 100 : actual > 0 ? 100 : 0;

  let tendencia: "arriba" | "abajo" | "estable" = "estable";
  if (Math.abs(porcentaje) < 1) {
    tendencia = "estable";
  } else if (porcentaje > 0) {
    tendencia = "arriba";
  } else {
    tendencia = "abajo";
  }

  return {
    anterior,
    actual,
    diferencia,
    porcentaje: Math.round(porcentaje * 100) / 100,
    tendencia,
  };
}

/**
 * Ranks advisors by sales in descending order
 * @param datos - Array of advisor records
 * @param campVenta - Optional property name for sales amount (defaults to "venta")
 * @param campNombre - Optional property name for advisor name (defaults to "nombre")
 * @param campId - Optional property name for advisor ID (defaults to "id")
 * @returns Ranked advisors with positions
 * @example
 * const asesores = [
 *   { id: "1", nombre: "Juan", venta: 100000 },
 *   { id: "2", nombre: "María", venta: 150000 }
 * ];
 * const ranking = rankingAsesores(asesores);
 * // María ranks 1st, Juan ranks 2nd
 */
export function rankingAsesores<T extends Record<string, unknown>>(
  datos: T[],
  campVenta = "venta",
  campNombre = "nombre",
  campId = "id",
): AsesoresRanking[] {
  if (!datos || datos.length === 0) return [];

  const conVentas = datos
    .map((item) => ({
      id: String(item[campId] ?? ""),
      nombre: String(item[campNombre] ?? "Sin nombre"),
      venta: (item[campVenta] as number) ?? 0,
    }))
    .filter((item) => typeof item.venta === "number" && !Number.isNaN(item.venta))
    .sort((a, b) => b.venta - a.venta);

  return conVentas.map((item, idx) => ({
    ...item,
    posicion: idx + 1,
  }));
}

/**
 * Filters overdue accounts based on days past due
 * @param cuentas - Array of account records
 * @param dias - Days threshold to consider as overdue
 * @param campDias - Optional property name for days overdue (defaults to "dias_vencimiento")
 * @param campId - Optional property name for account ID (defaults to "id")
 * @param campNombre - Optional property name for account name (defaults to "nombre")
 * @param campMonto - Optional property name for amount (defaults to "monto")
 * @returns Filtered overdue accounts with flags
 * @example
 * const cuentas = [
 *   { id: "1", nombre: "Cliente A", dias_vencimiento: 30, monto: 50000 },
 *   { id: "2", nombre: "Cliente B", dias_vencimiento: 5, monto: 25000 }
 * ];
 * const vencidas = carteraVencida(cuentas, 15);
 * // Returns only accounts overdue more than 15 days
 */
export function carteraVencida<T extends Record<string, unknown>>(
  cuentas: T[],
  dias: number,
  campDias = "dias_vencimiento",
  campId = "id",
  campNombre = "nombre",
  campMonto = "monto",
): CuentaVencida[] {
  if (!cuentas || cuentas.length === 0) return [];

  const resultado: CuentaVencida[] = cuentas
    .map((cuenta) => {
      const diasVencimiento = (cuenta[campDias] as number) ?? 0;
      const monto = (cuenta[campMonto] as number) ?? 0;

      return {
        id: String(cuenta[campId] ?? ""),
        nombre: String(cuenta[campNombre] ?? "Sin nombre"),
        diasVencimiento,
        monto,
        vencida: diasVencimiento > dias,
      };
    })
    .filter((cuenta) => cuenta.vencida)
    .sort((a, b) => b.diasVencimiento - a.diasVencimiento);

  return resultado;
}

/**
 * Calculates summary statistics for a numeric dataset
 * @param valores - Array of numeric values
 * @returns Statistics object with min, max, avg, sum
 * @example
 * const stats = calcularEstadisticas([100, 200, 150, 300]);
 * // { min: 100, max: 300, promedio: 187.5, total: 750 }
 */
export function calcularEstadisticas(valores: number[]): {
  min: number;
  max: number;
  promedio: number;
  total: number;
  cantidad: number;
} {
  if (!valores || valores.length === 0) {
    return { min: 0, max: 0, promedio: 0, total: 0, cantidad: 0 };
  }

  const valoresValidos = valores.filter((v) => typeof v === "number" && !Number.isNaN(v));

  if (valoresValidos.length === 0) {
    return { min: 0, max: 0, promedio: 0, total: 0, cantidad: 0 };
  }

  const total = valoresValidos.reduce((sum, val) => sum + val, 0);

  return {
    min: Math.min(...valoresValidos),
    max: Math.max(...valoresValidos),
    promedio: Math.round((total / valoresValidos.length) * 100) / 100,
    total,
    cantidad: valoresValidos.length,
  };
}

/**
 * Filters data by date range
 * @param datos - Array of records with date property
 * @param fechaInicio - Start date (inclusive)
 * @param fechaFin - End date (inclusive)
 * @param campFecha - Optional date property name (defaults to "fecha")
 * @returns Filtered records within date range
 * @example
 * const ventas = [
 *   { fecha: "2024-01-15", monto: 100 },
 *   { fecha: "2024-02-20", monto: 150 }
 * ];
 * const enero = filtrarPorFecha(ventas, "2024-01-01", "2024-01-31");
 */
export function filtrarPorFecha<T extends Record<string, unknown>>(
  datos: T[],
  fechaInicio: string | Date,
  fechaFin: string | Date,
  campFecha = "fecha",
): T[] {
  if (!datos || datos.length === 0) return [];

  const inicio = new Date(fechaInicio).getTime();
  const fin = new Date(fechaFin).getTime();

  return datos.filter((item) => {
    const fecha = new Date(item[campFecha] as string | Date).getTime();
    return fecha >= inicio && fecha <= fin;
  });
}

/**
 * Calculates growth rate between two periods
 * @param periodoAnterior - Array of values from previous period
 * @param periodoPosterior - Array of values from current period
 * @returns Growth percentage and comparison
 * @example
 * const crecimiento = calcularCrecimiento([100, 200], [120, 240]);
 * // { porcentaje: 10, estado: "arriba" }
 */
export function calcularCrecimiento(
  periodoAnterior: number[],
  periodoPosterior: number[],
): { porcentaje: number; estado: "arriba" | "abajo" | "estable" } {
  const totalAnterior = periodoAnterior.reduce((sum, val) => sum + (val ?? 0), 0);
  const totalPosterior = periodoPosterior.reduce((sum, val) => sum + (val ?? 0), 0);

  if (totalAnterior === 0) {
    return {
      porcentaje: totalPosterior > 0 ? 100 : 0,
      estado: totalPosterior > 0 ? "arriba" : "estable",
    };
  }

  const porcentaje = ((totalPosterior - totalAnterior) / totalAnterior) * 100;
  let estado: "arriba" | "abajo" | "estable" = "estable";

  if (Math.abs(porcentaje) < 1) {
    estado = "estable";
  } else if (porcentaje > 0) {
    estado = "arriba";
  } else {
    estado = "abajo";
  }

  return {
    porcentaje: Math.round(porcentaje * 100) / 100,
    estado,
  };
}
