"use server";

import { and, eq, gte, lt } from "drizzle-orm";
import { facturas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange } from "@/lib/date-range";

const REPUESTOS_UNIT_ID = "8fc832e2-e67f-4204-9f4c-087b2ec36660";

export async function getRepuestosMetricsAction(data: { ranges: DateRange[] }) {
  return withAuth(({ tx }) => {
    const rangeCond = dateRangeCondition(facturas.fecha, data.ranges);
    const conditions = [eq(facturas.unidadNegocioId, REPUESTOS_UNIT_ID)];
    if (rangeCond) conditions.push(rangeCond);
    return tx
      .select()
      .from(facturas)
      .where(and(...conditions));
  });
}

export async function getRepuestosTrendAction(data: { anio: number }) {
  return withAuth(({ tx }) => {
    return tx
      .select({ monto: facturas.monto, fecha: facturas.fecha })
      .from(facturas)
      .where(
        and(
          eq(facturas.unidadNegocioId, REPUESTOS_UNIT_ID),
          gte(facturas.fecha, `${data.anio}-01-01`),
          lt(facturas.fecha, `${data.anio + 1}-01-01`),
        ),
      );
  });
}
