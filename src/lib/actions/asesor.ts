"use server";

import { and, eq, gte, lt, inArray, type SQLWrapper } from "drizzle-orm";
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
    return cap === 12 ? undefined : inArray(col, Array.from({ length: cap }, (_, i) => i + 1));
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

    const [facturacion, perdidas, cotiz, presupuestos, minutasRows] = await Promise.all([
      tx
        .select()
        .from(facturas)
        .where(and(dateRangeCondition(facturas.fecha, ranges), inCond(facturas.unidadNegocioId, unidades))),
      tx
        .select()
        .from(ventasPerdidas)
        .where(
          and(dateRangeCondition(ventasPerdidas.fecha, ranges), inCond(ventasPerdidas.unidadNegocioId, unidades)),
        ),
      tx
        .select({ id: cotizaciones.id, monto: cotizaciones.monto })
        .from(cotizaciones)
        .where(
          and(dateRangeCondition(cotizaciones.fecha, ranges), inCond(cotizaciones.unidadNegocioId, unidades)),
        ),
      tx
        .select({
          mes: cumplimientoAsesores.mes,
          presupuesto: cumplimientoAsesores.presupuesto,
          pctParticipacion: cumplimientoAsesores.pctParticipacion,
          unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
        })
        .from(cumplimientoAsesores)
        .where(
          and(
            eq(cumplimientoAsesores.anio, anio),
            mesCond(cumplimientoAsesores.mes, meses, anio),
            inCond(cumplimientoAsesores.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({
          estado: minutas.estado,
          fechaLimite: minutas.fechaLimite,
          responsableId: minutas.responsableId,
        })
        .from(minutas)
        .where(and(dateRangeCondition(minutas.fecha, ranges), inCond(minutas.unidadNegocioId, unidades))),
    ]);

    return {
      facturacion,
      perdidas,
      cotizaciones: cotiz,
      presupuestos,
      minutas: minutasRows,
      scoreAsesor: presupuestos,
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
        .select({ monto: facturas.monto, fecha: facturas.fecha })
        .from(facturas)
        .where(
          and(
            gte(facturas.fecha, `${anio}-01-01`),
            lt(facturas.fecha, `${anio + 1}-01-01`),
            inCond(facturas.unidadNegocioId, unidades),
          ),
        ),
      tx
        .select({ presupuesto: cumplimientoAsesores.presupuesto, mes: cumplimientoAsesores.mes })
        .from(cumplimientoAsesores)
        .where(
          and(
            eq(cumplimientoAsesores.anio, anio),
            mesCond(cumplimientoAsesores.mes, meses, anio),
            inCond(cumplimientoAsesores.unidadNegocioId, unidades),
          ),
        ),
    ]);

    return { facturas: fRows, presupuestos: pRows };
  });
}
