import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lt } from "drizzle-orm";
import { facturas } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange } from "@/lib/date-range";

function gcUnitFilter(context: {
  role: string | null;
  profile: { unidadNegocioId: string | null };
}) {
  return context.role === "gerente_comercial" ? context.profile.unidadNegocioId : null;
}

export const getLubfiltrosMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { ranges: DateRange[] }) => data)
  .handler(async ({ context, data }) => {
    const rangeCond = dateRangeCondition(facturas.fecha, data.ranges);
    const unitId = gcUnitFilter(context);
    const conditions = [
      rangeCond,
      unitId ? eq(facturas.unidadNegocioId, unitId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    return context.tx
      .select()
      .from(facturas)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
  });

export const getLubfiltrosTrendFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number }) => data)
  .handler(async ({ context, data }) => {
    const unitId = gcUnitFilter(context);
    const conditions = [
      gte(facturas.fecha, `${data.anio}-01-01`),
      lt(facturas.fecha, `${data.anio + 1}-01-01`),
      unitId ? eq(facturas.unidadNegocioId, unitId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    return context.tx
      .select({ monto: facturas.monto, fecha: facturas.fecha })
      .from(facturas)
      .where(and(...conditions));
  });
