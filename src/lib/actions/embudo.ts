"use server";

import { and, eq, gte, inArray, lt, sql, type SQLWrapper } from "drizzle-orm";
import { cotizaciones, presupuestos, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

function unitCond(col: SQLWrapper, unidades: string[]) {
  return unidades.length > 0 ? inArray(col, unidades) : undefined;
}

export async function getEmbudoCotizacionesAnioAction(data: { anio: number; unidades: string[] }) {
  return withAuth(({ tx }) => {
    return tx
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
}

export async function getEmbudoPresupuestosAnioAction(data: { anio: number; unidades: string[] }) {
  return withAuth(({ tx }) => {
    return tx
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
}

export async function getEmbudoTotalesAction(data: {
  anio: number;
  meses: number[];
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const [cotRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${cotizaciones.monto}), 0)` })
      .from(cotizaciones)
      .where(
        and(
          gte(cotizaciones.fecha, `${data.anio}-01-01`),
          lt(cotizaciones.fecha, `${data.anio + 1}-01-01`),
          data.meses.length > 0
            ? sql`extract(month from ${cotizaciones.fecha})::int = ANY(${data.meses})`
            : undefined,
          unitCond(cotizaciones.unidadNegocioId, data.unidades),
        ),
      );

    const [facRow] = await tx
      .select({
        total: sql<string>`coalesce(sum(${presupuestos.ventasCcv} + ${presupuestos.ventasXibi} + ${presupuestos.ventasEstrategicas}), 0)`,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          data.meses.length > 0 ? inArray(presupuestos.mes, data.meses) : undefined,
          unitCond(presupuestos.unidadNegocioId, data.unidades),
        ),
      );

    const [saldoRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${cobranzas.saldo}), 0)` })
      .from(cobranzas)
      .where(unitCond(cobranzas.unidadNegocioId, data.unidades));

    const cotizado = Number(cotRow?.total ?? 0);
    const facturado = Number(facRow?.total ?? 0);
    const cobrado = facturado - Number(saldoRow?.total ?? 0);
    return { cotizado, facturado, cobrado };
  });
}
