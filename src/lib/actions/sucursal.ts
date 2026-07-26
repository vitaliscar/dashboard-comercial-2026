"use server";

import { and, eq, gte, lt, inArray, sum, count, sql, type SQLWrapper } from "drizzle-orm";
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

    const [fRes, pRes, presRes] = await Promise.all([
      tx
        .select({
          totalMonto: sum(facturas.monto),
          cantidad: count(facturas.id),
        })
        .from(facturas)
        .where(
          and(
            dateRangeCondition(facturas.fecha, ranges),
            inCond(facturas.sucursalId, sucursales),
            inCond(facturas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({
          totalMonto: sum(ventasPerdidas.monto),
          cantidad: count(ventasPerdidas.id),
        })
        .from(ventasPerdidas)
        .where(
          and(
            dateRangeCondition(ventasPerdidas.fecha, ranges),
            inCond(ventasPerdidas.sucursalId, sucursales),
            inCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({
          totalMonto: sum(presupuestos.monto),
        })
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

    return {
      facturacion: {
        totalMonto: Number(fRes[0]?.totalMonto ?? 0),
        cantidad: Number(fRes[0]?.cantidad ?? 0),
      },
      perdidas: {
        totalMonto: Number(pRes[0]?.totalMonto ?? 0),
        cantidad: Number(pRes[0]?.cantidad ?? 0),
      },
      presupuestos: {
        totalMonto: Number(presRes[0]?.totalMonto ?? 0),
      },
    };
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
        .select({
          mes: sql<number>`EXTRACT(MONTH FROM ${facturas.fecha})::int`,
          monto: sum(facturas.monto),
        })
        .from(facturas)
        .where(
          and(
            gte(facturas.fecha, `${anio}-01-01`),
            lt(facturas.fecha, `${anio + 1}-01-01`),
            inCond(facturas.sucursalId, sucursales),
            inCond(facturas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(sql`EXTRACT(MONTH FROM ${facturas.fecha})`),
      tx
        .select({
          mes: presupuestos.mes,
          monto: sum(presupuestos.monto),
        })
        .from(presupuestos)
        .where(
          and(
            eq(presupuestos.anio, anio),
            mesCond(presupuestos.mes, meses, anio),
            inCond(presupuestos.sucursalId, sucursales),
            inCond(presupuestos.unidadNegocioId, unidades),
          ),
        )
        .groupBy(presupuestos.mes),
    ]);

    return {
      facturas: fRows.map((r) => ({ mes: Number(r.mes), monto: Number(r.monto ?? 0) })),
      presupuestos: pRows.map((r) => ({ mes: Number(r.mes), monto: Number(r.monto ?? 0) })),
    };
  });
}
