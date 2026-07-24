import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lt, sql, type SQLWrapper } from "drizzle-orm";
import { cotizaciones, presupuestos, cobranzas } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";

function unitCond(col: SQLWrapper, unidades: string[]) {
  return unidades.length > 0 ? inArray(col, unidades) : undefined;
}

export const getEmbudoCotizacionesAnioFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number; unidades: string[] }) => data)
  .handler(async ({ context, data }) => {
    return context.tx
      .select({
        id: cotizaciones.id,
        unidadNegocioId: cotizaciones.unidadNegocioId,
        monto: cotizaciones.monto,
        fecha: cotizaciones.fecha,
      })
      .from(cotizaciones)
      .where(
        and(
          gte(cotizaciones.fecha, `${data.anio}-01-01`),
          lt(cotizaciones.fecha, `${data.anio + 1}-01-01`),
          unitCond(cotizaciones.unidadNegocioId, data.unidades),
        ),
      );
  });

export const getEmbudoPresupuestosAnioFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number; unidades: string[] }) => data)
  .handler(async ({ context, data }) => {
    return context.tx
      .select({
        id: presupuestos.id,
        mes: presupuestos.mes,
        unidadNegocioId: presupuestos.unidadNegocioId,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          unitCond(presupuestos.unidadNegocioId, data.unidades),
        ),
      );
  });

/** Reemplaza rpc_embudo_totales — mismos 3 números (cotizado/facturado/cobrado), calculados
 * directo con SUM() de Postgres en vez de una function SQL dedicada. */
export const getEmbudoTotalesFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number; meses: number[]; unidades: string[] }) => data)
  .handler(async ({ context, data }) => {
    const [cotRow] = await context.tx
      .select({ total: sql<string>`coalesce(sum(${cotizaciones.monto}), 0)` })
      .from(cotizaciones)
      .where(
        and(
          gte(cotizaciones.fecha, `${data.anio}-01-01`),
          lt(cotizaciones.fecha, `${data.anio + 1}-01-01`),
          sql`extract(month from ${cotizaciones.fecha})::int = ANY(${data.meses})`,
          unitCond(cotizaciones.unidadNegocioId, data.unidades),
        ),
      );

    const [facRow] = await context.tx
      .select({
        total: sql<string>`coalesce(sum(${presupuestos.ventasCcv} + ${presupuestos.ventasXibi} + ${presupuestos.ventasEstrategicas}), 0)`,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          inArray(presupuestos.mes, data.meses),
          unitCond(presupuestos.unidadNegocioId, data.unidades),
        ),
      );

    const [saldoRow] = await context.tx
      .select({ total: sql<string>`coalesce(sum(${cobranzas.saldo}), 0)` })
      .from(cobranzas)
      .where(unitCond(cobranzas.unidadNegocioId, data.unidades));

    const cotizado = Number(cotRow.total);
    const facturado = Number(facRow.total);
    const cobrado = facturado - Number(saldoRow.total);
    return { cotizado, facturado, cobrado };
  });
