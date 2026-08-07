"use server";

import { and, eq, gte, lt, inArray, sum, count, sql } from "drizzle-orm";
import {
  cotizaciones,
  facturas,
  ventasPerdidas,
  servicios,
  presupuestos,
  cumplimientoAsesores,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

export async function getResumenDataAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  sucursalId?: string;
  prevMonthRanges?: DateRange[];
}) {
  return withAuth(async ({ tx, role }) => {
    const { anio, meses, ranges, sucursalId, prevMonthRanges = [] } = data;
    const sucCond = <T extends { sucursalId: unknown }>(col: T["sucursalId"]) =>
      sucursalId ? eq(col as never, sucursalId) : undefined;

    const cotCond = and(
      dateRangeCondition(cotizaciones.fecha, ranges),
      sucCond(cotizaciones.sucursalId),
    );
    const cotPrevCond =
      prevMonthRanges.length > 0
        ? and(
            dateRangeCondition(cotizaciones.fecha, prevMonthRanges),
            sucCond(cotizaciones.sucursalId),
          )
        : undefined;
    const facCond = and(dateRangeCondition(facturas.fecha, ranges), sucCond(facturas.sucursalId));
    const vpCond = and(
      dateRangeCondition(ventasPerdidas.fecha, ranges),
      sucCond(ventasPerdidas.sucursalId),
    );
    const vpPrevCond =
      prevMonthRanges.length > 0
        ? and(
            dateRangeCondition(ventasPerdidas.fecha, prevMonthRanges),
            sucCond(ventasPerdidas.sucursalId),
          )
        : undefined;
    const servCond = and(
      dateRangeCondition(servicios.fecha, ranges),
      sucCond(servicios.sucursalId),
    );

    const mesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              presupuestos.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(presupuestos.mes, meses);

    const caMesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              cumplimientoAsesores.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(cumplimientoAsesores.mes, meses);

    const [
      cot,
      cotPrev,
      cotMensual,
      cotClientes,
      fac,
      facClientes,
      vp,
      vpPrev,
      vpClientes,
      vpRazones,
      serv,
      pre,
      ca,
    ] = await Promise.all([
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          montoTotal: sum(cotizaciones.monto),
          cantidad: count(cotizaciones.id),
        })
        .from(cotizaciones)
        .where(cotCond)
        .groupBy(cotizaciones.unidadNegocioId),
      cotPrevCond
        ? tx
            .select({
              unidadNegocioId: cotizaciones.unidadNegocioId,
              montoTotal: sum(cotizaciones.monto),
            })
            .from(cotizaciones)
            .where(cotPrevCond)
            .groupBy(cotizaciones.unidadNegocioId)
        : Promise.resolve([]),
      // Cotizado mes a mes en el año completo (independiente del filtro de mes
      // seleccionado) — alimenta la línea de tiempo de la tarjeta de Cotizaciones.
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          mes: sql<number>`extract(month from ${cotizaciones.fecha})::int`,
          montoTotal: sum(cotizaciones.monto),
        })
        .from(cotizaciones)
        .where(
          and(
            gte(cotizaciones.fecha, `${anio}-01-01`),
            lt(cotizaciones.fecha, `${anio + 1}-01-01`),
            sucCond(cotizaciones.sucursalId),
          ),
        )
        .groupBy(cotizaciones.unidadNegocioId, sql`extract(month from ${cotizaciones.fecha})`),
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          sucursalId: cotizaciones.sucursalId,
          cliente: cotizaciones.cliente,
          montoTotal: sum(cotizaciones.monto),
        })
        .from(cotizaciones)
        .where(cotCond)
        .groupBy(cotizaciones.unidadNegocioId, cotizaciones.sucursalId, cotizaciones.cliente),
      tx
        .select({
          unidadNegocioId: facturas.unidadNegocioId,
          montoTotal: sum(facturas.monto),
          cantidad: count(facturas.id),
        })
        .from(facturas)
        .where(facCond)
        .groupBy(facturas.unidadNegocioId),
      tx
        .select({
          unidadNegocioId: facturas.unidadNegocioId,
          sucursalId: facturas.sucursalId,
          cliente: facturas.cliente,
          montoTotal: sum(facturas.monto),
        })
        .from(facturas)
        .where(facCond)
        .groupBy(facturas.unidadNegocioId, facturas.sucursalId, facturas.cliente),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          montoTotal: sum(ventasPerdidas.monto),
          cantidad: count(ventasPerdidas.id),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId),
      vpPrevCond
        ? tx
            .select({
              unidadNegocioId: ventasPerdidas.unidadNegocioId,
              montoTotal: sum(ventasPerdidas.monto),
            })
            .from(ventasPerdidas)
            .where(vpPrevCond)
            .groupBy(ventasPerdidas.unidadNegocioId)
        : Promise.resolve([]),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          sucursalId: ventasPerdidas.sucursalId,
          cliente: ventasPerdidas.cliente,
          montoTotal: sum(ventasPerdidas.monto),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId, ventasPerdidas.sucursalId, ventasPerdidas.cliente),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          razon: ventasPerdidas.razon,
          montoTotal: sum(ventasPerdidas.monto),
          cantidad: count(ventasPerdidas.id),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId, ventasPerdidas.razon),
      tx
        .select({
          unidadNegocioId: servicios.unidadNegocioId,
          montoTotal: sum(servicios.monto),
          cantidad: count(servicios.id),
        })
        .from(servicios)
        .where(servCond)
        .groupBy(servicios.unidadNegocioId),
      tx
        .select()
        .from(presupuestos)
        .where(and(eq(presupuestos.anio, anio), mesCond, sucCond(presupuestos.sucursalId))),
      role === "asesor"
        ? tx
            .select({
              mes: cumplimientoAsesores.mes,
              presupuesto: cumplimientoAsesores.presupuesto,
              venta: cumplimientoAsesores.venta,
              unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
            })
            .from(cumplimientoAsesores)
            .where(and(eq(cumplimientoAsesores.anio, anio), caMesCond))
        : Promise.resolve([]),
    ]);

    return {
      cotizaciones: cot,
      cotizacionesPrevMonth: cotPrev,
      cotizacionesMensual: cotMensual,
      cotizacionesClientes: cotClientes,
      facturas: fac,
      facturasClientes: facClientes,
      ventasPerdidas: vp,
      ventasPerdidasPrevMonth: vpPrev,
      ventasPerdidasClientes: vpClientes,
      ventasPerdidasRazones: vpRazones,
      servicios: serv,
      presupuestos: pre,
      cumplimientoAsesor: ca,
    };
  });
}
