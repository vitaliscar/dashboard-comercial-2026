"use server";

import { and, sum, sql } from "drizzle-orm";
import { cotizaciones, facturas, ventasPerdidas, servicios } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { getDateRangesForMonths, type MonthFilter } from "@/lib/date-range";
import { dateRangeCondition } from "@/lib/server/query-helpers";

export type ParetoFuente = "cotizado" | "facturado" | "perdido";

/** Misma exclusión que Top Clientes / Cliente 360 (venta interna). */
const EXCLURE_CONSORCIO = sql`cliente NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`;

type ParetoRow = {
  cliente: string;
  asesor: string | null;
  monto: number;
  sucursal_id: string | null;
};

function mergeParetoRows(parts: ParetoRow[][]): ParetoRow[] {
  const map = new Map<string, ParetoRow>();
  for (const rows of parts) {
    for (const r of rows) {
      const key = `${r.cliente}\0${r.asesor ?? ""}\0${r.sucursal_id ?? ""}`;
      const cur = map.get(key);
      if (cur) cur.monto += r.monto;
      else map.set(key, { ...r });
    }
  }
  return Array.from(map.values());
}

export async function getParetoDataAction(data: {
  fuente: ParetoFuente;
  anio: number;
  meses: MonthFilter;
}) {
  return withAuth(async ({ tx }) => {
    const { fuente, anio, meses } = data;
    const ranges = getDateRangesForMonths(anio, meses);

    if (fuente === "cotizado") {
      const rows = await tx
        .select({
          cliente: cotizaciones.cliente,
          asesor: cotizaciones.asesorCodigo,
          monto: sum(cotizaciones.monto),
          sucursal_id: cotizaciones.sucursalId,
        })
        .from(cotizaciones)
        .where(and(dateRangeCondition(cotizaciones.fecha, ranges)))
        .groupBy(cotizaciones.cliente, cotizaciones.asesorCodigo, cotizaciones.sucursalId);
      return rows.map((r) => ({ ...r, monto: Number(r.monto ?? 0) }));
    } else if (fuente === "facturado") {
      // Misma fuente que Top Clientes Facturados: facturas + servicios (AS400).
      const [facRows, servRows] = await Promise.all([
        tx
          .select({
            cliente: facturas.cliente,
            asesor: facturas.asesor,
            monto: sum(facturas.monto),
            sucursal_id: facturas.sucursalId,
          })
          .from(facturas)
          .where(and(dateRangeCondition(facturas.fecha, ranges), EXCLURE_CONSORCIO))
          .groupBy(facturas.cliente, facturas.asesor, facturas.sucursalId),
        tx
          .select({
            cliente: servicios.cliente,
            asesor: servicios.asesor,
            monto: sum(servicios.monto),
            sucursal_id: servicios.sucursalId,
          })
          .from(servicios)
          .where(and(dateRangeCondition(servicios.fecha, ranges), EXCLURE_CONSORCIO))
          .groupBy(servicios.cliente, servicios.asesor, servicios.sucursalId),
      ]);
      return mergeParetoRows([
        facRows.map((r) => ({
          cliente: r.cliente,
          asesor: r.asesor,
          monto: Number(r.monto ?? 0),
          sucursal_id: r.sucursal_id,
        })),
        servRows.map((r) => ({
          cliente: r.cliente,
          asesor: r.asesor,
          monto: Number(r.monto ?? 0),
          sucursal_id: r.sucursal_id,
        })),
      ]);
    } else {
      const rows = await tx
        .select({
          cliente: ventasPerdidas.cliente,
          asesor: ventasPerdidas.asesor,
          monto: sum(ventasPerdidas.monto),
          sucursal_id: ventasPerdidas.sucursalId,
        })
        .from(ventasPerdidas)
        .where(and(dateRangeCondition(ventasPerdidas.fecha, ranges)))
        .groupBy(ventasPerdidas.cliente, ventasPerdidas.asesor, ventasPerdidas.sucursalId);
      return rows.map((r) => ({ ...r, monto: Number(r.monto ?? 0) }));
    }
  });
}
