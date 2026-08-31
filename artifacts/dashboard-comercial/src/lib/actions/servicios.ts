"use server";

import { and, eq, gt, gte, lt, inArray } from "drizzle-orm";
import {
  servicios,
  cobranzas,
  detallesServiciosEstrategicos,
  presupuestos,
  serviciosInterno,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

export async function getServiciosAction(data: { ranges: DateRange[]; sucursal: string | "all" }) {
  return withAuth(async ({ tx }) => {
    return tx
      .select()
      .from(servicios)
      .where(
        and(
          dateRangeCondition(servicios.fecha, data.ranges),
          data.sucursal !== "all" ? eq(servicios.sucursalId, data.sucursal) : undefined,
          eq(servicios.unidadNegocioId, await unidadId("servicios")),
        ),
      );
  });
}

export async function getPresupuestosServiciosAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
    const monthCap = getAllMonthsCap(data.anio);
    const monthCond = Array.isArray(data.meses)
      ? inArray(presupuestos.mes, data.meses)
      : monthCap === 12
        ? undefined
        : inArray(
            presupuestos.mes,
            Array.from({ length: monthCap }, (_, i) => i + 1),
          );

    return tx
      .select({
        id: presupuestos.id,
        anio: presupuestos.anio,
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        monto: presupuestos.monto,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          monthCond,
          data.sucursal !== "all" ? eq(presupuestos.sucursalId, data.sucursal) : undefined,
          eq(presupuestos.unidadNegocioId, await unidadId("servicios")),
        ),
      );
  });
}

export async function getServiciosInternoAction(data: { meses: MonthFilter }) {
  return withAuth(async ({ tx }) => {
    const monthCond = Array.isArray(data.meses)
      ? inArray(serviciosInterno.mes, data.meses)
      : undefined;
    return tx.select().from(serviciosInterno).where(monthCond);
  });
}

export async function getCobranzasServiciosAction(data: { sucursal: string | "all" }) {
  return withAuth(async ({ tx }) => {
    return tx
      .select()
      .from(cobranzas)
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          data.sucursal !== "all" ? eq(cobranzas.sucursalId, data.sucursal) : undefined,
          eq(cobranzas.unidadNegocioId, await unidadId("servicios")),
        ),
      )
      .orderBy(cobranzas.fechaVencimiento);
  });
}

export async function getServiciosTrendAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
    return tx
      .select({
        monto: servicios.monto,
        fecha: servicios.fecha,
        taller: servicios.taller,
        csa: servicios.csa,
        categoriaVenta: servicios.categoriaVenta,
      })
      .from(servicios)
      .where(
        and(
          gte(servicios.fecha, `${data.anio}-01-01`),
          lt(servicios.fecha, `${data.anio + 1}-01-01`),
          data.sucursal !== "all" ? eq(servicios.sucursalId, data.sucursal) : undefined,
          eq(servicios.unidadNegocioId, await unidadId("servicios")),
        ),
      );
  });
}

export async function getDetallesServiciosEstrategicosAction(data: {
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
    const isAllMonths = data.meses === "all";
    const monthList = Array.isArray(data.meses) ? data.meses : [];
    return tx
      .select()
      .from(detallesServiciosEstrategicos)
      .where(
        and(
          !isAllMonths && monthList.length > 0
            ? inArray(detallesServiciosEstrategicos.mes, monthList)
            : undefined,
          data.sucursal !== "all"
            ? eq(detallesServiciosEstrategicos.sucursalId, data.sucursal)
            : undefined,
        ),
      );
  });
}
