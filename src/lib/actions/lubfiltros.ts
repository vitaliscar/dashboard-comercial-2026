"use server";

import { and, eq, gte, lt, sum, count, sql } from "drizzle-orm";
import { facturas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange } from "@/lib/date-range";

export async function getLubfiltrosMetricsAction(data: { ranges: DateRange[] }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("lubfiltros");
    const rows = await tx
      .select({
        sucursalId: facturas.sucursalId,
        cliente: facturas.cliente,
        monto: sum(facturas.monto),
        cantidad: count(facturas.id),
      })
      .from(facturas)
      .where(
        and(dateRangeCondition(facturas.fecha, data.ranges), eq(facturas.unidadNegocioId, unitId)),
      )
      .groupBy(facturas.sucursalId, facturas.cliente);

    return rows.map((r) => ({
      ...r,
      monto: Number(r.monto ?? 0),
      cantidad: Number(r.cantidad ?? 0),
    }));
  });
}

export async function getLubfiltrosTrendAction(data: { anio: number }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("lubfiltros");
    const rows = await tx
      .select({
        mes: sql<number>`EXTRACT(MONTH FROM ${facturas.fecha})::int`,
        monto: sum(facturas.monto),
      })
      .from(facturas)
      .where(
        and(
          gte(facturas.fecha, `${data.anio}-01-01`),
          lt(facturas.fecha, `${data.anio + 1}-01-01`),
          eq(facturas.unidadNegocioId, unitId),
        ),
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${facturas.fecha})`);

    return rows.map((r) => ({
      mes: Number(r.mes),
      monto: Number(r.monto ?? 0),
    }));
  });
}
