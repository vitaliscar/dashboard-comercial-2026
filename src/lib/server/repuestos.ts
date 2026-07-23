import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, lt } from "drizzle-orm";
import { facturas } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange } from "@/lib/date-range";

const REPUESTOS_UNIT_ID = "8fc832e2-e67f-4204-9f4c-087b2ec36660";

export const getRepuestosMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { ranges: DateRange[] }) => data)
  .handler(async ({ context, data }) => {
    const rangeCond = dateRangeCondition(facturas.fecha, data.ranges);
    const conditions = [eq(facturas.unidadNegocioId, REPUESTOS_UNIT_ID)];
    if (rangeCond) conditions.push(rangeCond);
    return context.tx
      .select()
      .from(facturas)
      .where(and(...conditions));
  });

export const getRepuestosTrendFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number }) => data)
  .handler(async ({ context, data }) => {
    return context.tx
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
