"use server";

import { and, eq, gte, lt } from "drizzle-orm";
import { facturas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange } from "@/lib/date-range";

function gcUnitFilter(role: string | null, unidadNegocioId: string | null) {
  return role === "gerente_comercial" ? unidadNegocioId : null;
}

export async function getLubfiltrosMetricsAction(data: { ranges: DateRange[] }) {
  return withAuth(async ({ tx, role, profile }) => {
    const unitId = gcUnitFilter(role, profile.unidadNegocioId);
    return tx
      .select()
      .from(facturas)
      .where(
        and(
          dateRangeCondition(facturas.fecha, data.ranges),
          unitId ? eq(facturas.unidadNegocioId, unitId) : undefined,
        ),
      );
  });
}

export async function getLubfiltrosTrendAction(data: { anio: number }) {
  return withAuth(async ({ tx, role, profile }) => {
    const unitId = gcUnitFilter(role, profile.unidadNegocioId);
    return tx
      .select({ monto: facturas.monto, fecha: facturas.fecha })
      .from(facturas)
      .where(
        and(
          gte(facturas.fecha, `${data.anio}-01-01`),
          lt(facturas.fecha, `${data.anio + 1}-01-01`),
          unitId ? eq(facturas.unidadNegocioId, unitId) : undefined,
        ),
      );
  });
}
