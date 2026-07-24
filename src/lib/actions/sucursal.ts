"use server";

import { and, eq, gte, lt, inArray, type SQLWrapper } from "drizzle-orm";
import { facturas, ventasPerdidas, presupuestos } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

function inCond(col: SQLWrapper, values: string[]) {
  return values.length > 0 ? inArray(col, values) : undefined;
}

function mesCond(col: SQLWrapper, meses: MonthFilter, anio: number) {
  if (meses === "all") {
    const cap = getAllMonthsCap(anio);
    return cap === 12
      ? undefined
      : inArray(
          col,
          Array.from({ length: cap }, (_, i) => i + 1),
        );
  }
  return inArray(col, meses);
}

export async function getSucursalMetricsAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  sucursales: string[];
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { anio, meses, ranges, sucursales, unidades } = data;

    const [facturacion, perdidas, pres] = await Promise.all([
      tx
        .select()
        .from(facturas)
        .where(
          and(
            dateRangeCondition(facturas.fecha, ranges),
            inCond(facturas.sucursalId, sucursales),
            inCond(facturas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select()
        .from(ventasPerdidas)
        .where(
          and(
            dateRangeCondition(ventasPerdidas.fecha, ranges),
            inCond(ventasPerdidas.sucursalId, sucursales),
            inCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select()
        .from(presupuestos)
        .where(
          and(
            eq(presupuestos.anio, anio),
            mesCond(presupuestos.mes, meses, anio),
            inCond(presupuestos.sucursalId, sucursales),
            inCond(presupuestos.unidadNegocioId, unidades),
          ),
        ),
    ]);

    return { facturacion, perdidas, presupuestos: pres };
  });
}

export async function getSucursalTrendAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursales: string[];
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { anio, meses, sucursales, unidades } = data;

    const [fRows, pRows] = await Promise.all([
      tx
        .select({ monto: facturas.monto, fecha: facturas.fecha })
        .from(facturas)
        .where(
          and(
            gte(facturas.fecha, `${anio}-01-01`),
            lt(facturas.fecha, `${anio + 1}-01-01`),
            inCond(facturas.sucursalId, sucursales),
            inCond(facturas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({ monto: presupuestos.monto, mes: presupuestos.mes })
        .from(presupuestos)
        .where(
          and(
            eq(presupuestos.anio, anio),
            mesCond(presupuestos.mes, meses, anio),
            inCond(presupuestos.sucursalId, sucursales),
            inCond(presupuestos.unidadNegocioId, unidades),
          ),
        ),
    ]);

    return { facturas: fRows, presupuestos: pRows };
  });
}
