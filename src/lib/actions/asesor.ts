"use server";

import { and, eq, gte, lt, inArray, sum, count, sql, type SQLWrapper } from "drizzle-orm";
import { facturas, ventasPerdidas, cotizaciones, cumplimientoAsesores, minutas } from "@/db/schema";
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

export async function getAsesorMetricsAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { anio, meses, ranges, unidades } = data;

    const [fRes, pRes, cRes, preRes, mRes] = await Promise.all([
      tx
        .select({
          totalMonto: sum(facturas.monto),
          cantidad: count(facturas.id),
        })
        .from(facturas)
        .where(
          and(
            dateRangeCondition(facturas.fecha, ranges),
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
            inCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({
          cantidad: count(cotizaciones.id),
        })
        .from(cotizaciones)
        .where(
          and(
            dateRangeCondition(cotizaciones.fecha, ranges),
            inCond(cotizaciones.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({
          mes: cumplimientoAsesores.mes,
          presupuesto: sum(cumplimientoAsesores.presupuesto),
          pctParticipacion: cumplimientoAsesores.pctParticipacion,
        })
        .from(cumplimientoAsesores)
        .where(
          and(
            eq(cumplimientoAsesores.anio, anio),
            mesCond(cumplimientoAsesores.mes, meses, anio),
            inCond(cumplimientoAsesores.unidadNegocioId, unidades),
          ),
        )
        .groupBy(cumplimientoAsesores.mes, cumplimientoAsesores.pctParticipacion),
      tx
        .select({
          estado: minutas.estado,
          fechaLimite: minutas.fechaLimite,
          cantidad: count(minutas.id),
        })
        .from(minutas)
        .where(
          and(dateRangeCondition(minutas.fecha, ranges), inCond(minutas.unidadNegocioId, unidades)),
        )
        .groupBy(minutas.estado, minutas.fechaLimite),
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
      cotizaciones: {
        cantidad: Number(cRes[0]?.cantidad ?? 0),
      },
      presupuestos: preRes.map((r) => ({
        mes: r.mes,
        presupuesto: Number(r.presupuesto ?? 0),
        pctParticipacion: Number(r.pctParticipacion ?? 0),
      })),
      scoreAsesor: preRes.map((r) => ({
        mes: r.mes,
        presupuesto: Number(r.presupuesto ?? 0),
        pctParticipacion: Number(r.pctParticipacion ?? 0),
      })),
      minutas: mRes.map((r) => ({
        estado: r.estado,
        fechaLimite: r.fechaLimite,
        cantidad: Number(r.cantidad ?? 0),
      })),
    };
  });
}

export async function getAsesorTrendAction(data: {
  anio: number;
  meses: MonthFilter;
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { anio, meses, unidades } = data;

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
            inCond(facturas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(sql`EXTRACT(MONTH FROM ${facturas.fecha})`),
      tx
        .select({
          mes: cumplimientoAsesores.mes,
          presupuesto: sum(cumplimientoAsesores.presupuesto),
        })
        .from(cumplimientoAsesores)
        .where(
          and(
            eq(cumplimientoAsesores.anio, anio),
            mesCond(cumplimientoAsesores.mes, meses, anio),
            inCond(cumplimientoAsesores.unidadNegocioId, unidades),
          ),
        )
        .groupBy(cumplimientoAsesores.mes),
    ]);

    return {
      facturas: fRows.map((r) => ({
        mes: Number(r.mes),
        monto: Number(r.monto ?? 0),
      })),
      presupuestos: pRows.map((r) => ({
        mes: Number(r.mes),
        presupuesto: Number(r.presupuesto ?? 0),
      })),
    };
  });
}
