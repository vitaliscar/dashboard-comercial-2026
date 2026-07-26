"use server";

import { and, eq, gt, gte, lt, inArray } from "drizzle-orm";
import { servicios, cobranzas, detallesServiciosEstrategicos } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange, MonthFilter } from "@/lib/date-range";

export async function getServiciosAction(data: {
  ranges: DateRange[];
  sucursal: string | "all";
  unidades: string[];
}) {
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
  unidades: string[];
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
