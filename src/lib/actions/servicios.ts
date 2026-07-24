"use server";

import { and, eq, gt, gte, lt, inArray, type SQLWrapper } from "drizzle-orm";
import { servicios, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange, MonthFilter } from "@/lib/date-range";

function inCond(col: SQLWrapper, values: string[]) {
  return values.length > 0 ? inArray(col, values) : undefined;
}

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
          inCond(servicios.unidadNegocioId, data.unidades),
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
      .select({ monto: servicios.monto, fecha: servicios.fecha })
      .from(servicios)
      .where(
        and(
          gte(servicios.fecha, `${data.anio}-01-01`),
          lt(servicios.fecha, `${data.anio + 1}-01-01`),
          data.sucursal !== "all" ? eq(servicios.sucursalId, data.sucursal) : undefined,
          inCond(servicios.unidadNegocioId, data.unidades),
        ),
      );
  });
}
