"use server";

import { and, eq, gte, lt, inArray } from "drizzle-orm";
import {
  cotizaciones,
  facturas,
  ventasPerdidas,
  servicios,
  presupuestos,
  cumplimientoAsesores,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

export async function getResumenDataAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  sucursalId?: string;
}) {
  return withAuth(async ({ tx, role }) => {
    const { anio, meses, ranges, sucursalId } = data;
    const sucCond = <T extends { sucursalId: unknown }>(col: T["sucursalId"]) =>
      sucursalId ? eq(col as never, sucursalId) : undefined;

    const cotCond = and(dateRangeCondition(cotizaciones.fecha, ranges), sucCond(cotizaciones.sucursalId));
    const facCond = and(dateRangeCondition(facturas.fecha, ranges), sucCond(facturas.sucursalId));
    const vpCond = and(dateRangeCondition(ventasPerdidas.fecha, ranges), sucCond(ventasPerdidas.sucursalId));
    const servCond = and(dateRangeCondition(servicios.fecha, ranges), sucCond(servicios.sucursalId));

    const mesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              presupuestos.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(presupuestos.mes, meses);

    const caMesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              cumplimientoAsesores.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(cumplimientoAsesores.mes, meses);

    const [cot, fac, vp, serv, pre, ca] = await Promise.all([
      tx.select().from(cotizaciones).where(cotCond),
      tx.select().from(facturas).where(facCond),
      tx.select().from(ventasPerdidas).where(vpCond),
      tx.select().from(servicios).where(servCond),
      tx
        .select()
        .from(presupuestos)
        .where(and(eq(presupuestos.anio, anio), mesCond, sucCond(presupuestos.sucursalId))),
      role === "asesor"
        ? tx
            .select({
              mes: cumplimientoAsesores.mes,
              presupuesto: cumplimientoAsesores.presupuesto,
              venta: cumplimientoAsesores.venta,
              unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
            })
            .from(cumplimientoAsesores)
            .where(and(eq(cumplimientoAsesores.anio, anio), caMesCond))
        : Promise.resolve([]),
    ]);

    return {
      cotizaciones: cot,
      facturas: fac,
      ventasPerdidas: vp,
      servicios: serv,
      presupuestos: pre,
      cumplimientoAsesor: ca,
    };
  });
}
