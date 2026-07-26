"use server";

import { and, gte, lt, sum } from "drizzle-orm";
import { cotizaciones, facturas, ventasPerdidas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export type ParetoFuente = "cotizado" | "facturado" | "perdido";

export async function getParetoDataAction(data: {
  fuente: ParetoFuente;
  anio: number;
  mes: number;
}) {
  return withAuth(async ({ tx }) => {
    const { fuente, anio, mes } = data;
    const desde = mes === 0 ? `${anio}-01-01` : `${anio}-${String(mes).padStart(2, "0")}-01`;
    const hastaAnio = mes === 0 || mes === 12 ? anio + 1 : anio;
    const hastaMes = mes === 0 || mes === 12 ? 1 : mes + 1;
    const hasta = `${hastaAnio}-${String(hastaMes).padStart(2, "0")}-01`;

    if (fuente === "cotizado") {
      const rows = await tx
        .select({
          cliente: cotizaciones.cliente,
          asesor: cotizaciones.asesorCodigo,
          monto: sum(cotizaciones.monto),
          sucursal_id: cotizaciones.sucursalId,
        })
        .from(cotizaciones)
        .where(and(gte(cotizaciones.fecha, desde), lt(cotizaciones.fecha, hasta)))
        .groupBy(cotizaciones.cliente, cotizaciones.asesorCodigo, cotizaciones.sucursalId);
      return rows.map((r) => ({ ...r, monto: Number(r.monto ?? 0) }));
    } else if (fuente === "facturado") {
      const rows = await tx
        .select({
          cliente: facturas.cliente,
          asesor: facturas.asesor,
          monto: sum(facturas.monto),
          sucursal_id: facturas.sucursalId,
        })
        .from(facturas)
        .where(and(gte(facturas.fecha, desde), lt(facturas.fecha, hasta)))
        .groupBy(facturas.cliente, facturas.asesor, facturas.sucursalId);
      return rows.map((r) => ({ ...r, monto: Number(r.monto ?? 0) }));
    } else {
      const rows = await tx
        .select({
          cliente: ventasPerdidas.cliente,
          asesor: ventasPerdidas.asesor,
          monto: sum(ventasPerdidas.monto),
          sucursal_id: ventasPerdidas.sucursalId,
        })
        .from(ventasPerdidas)
        .where(and(gte(ventasPerdidas.fecha, desde), lt(ventasPerdidas.fecha, hasta)))
        .groupBy(ventasPerdidas.cliente, ventasPerdidas.asesor, ventasPerdidas.sucursalId);
      return rows.map((r) => ({ ...r, monto: Number(r.monto ?? 0) }));
    }
  });
}
