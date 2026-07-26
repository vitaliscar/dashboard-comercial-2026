"use server";

import { and, eq, gte, lt, gt, inArray, sum, sql, type SQLWrapper } from "drizzle-orm";
import { facturas, presupuestos, cobranzas, ventasPerdidas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

function mesCond(col: SQLWrapper, meses: MonthFilter, anio: number) {
  if (meses === "all") {
    const cap = getAllMonthsCap(anio);
    return cap === 12
      ? undefined
      : inArray(
          col,
          Array.from({ length: cap }, (_, i) => i + 1),
        );
  }
  return inArray(col, meses);
}

export async function getEquiposFacturacionAction(data: { anio: number }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("equipos");
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

export async function getEquiposPresupuestoAction(data: { anio: number; meses: MonthFilter }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("equipos");
    const rows = await tx
      .select({ monto: sum(presupuestos.monto) })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          mesCond(presupuestos.mes, data.meses, data.anio),
          eq(presupuestos.unidadNegocioId, unitId),
        ),
      );

    return rows.map((r) => ({ monto: Number(r.monto ?? 0) }));
  });
}

export async function getEquiposVentasPerdidasAction(data: { ranges: DateRange[] }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("equipos");
    const rows = await tx
      .select({
        cliente: ventasPerdidas.cliente,
        razon: ventasPerdidas.razon,
        fecha: ventasPerdidas.fecha,
        monto: sum(ventasPerdidas.monto),
      })
      .from(ventasPerdidas)
      .where(
        and(
          dateRangeCondition(ventasPerdidas.fecha, data.ranges),
          eq(ventasPerdidas.unidadNegocioId, unitId),
        ),
      )
      .groupBy(ventasPerdidas.cliente, ventasPerdidas.razon, ventasPerdidas.fecha);

    return rows.map((r) => ({
      ...r,
      monto: Number(r.monto ?? 0),
    }));
  });
}

export async function getEquiposClientesCobroAction() {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("equipos");
    const rows = await tx
      .select({
        cliente: cobranzas.cliente,
        sucursalId: cobranzas.sucursalId,
        monto: sum(cobranzas.monto),
        saldo: sum(cobranzas.saldo),
      })
      .from(cobranzas)
      .where(and(gt(cobranzas.saldo, "0"), eq(cobranzas.unidadNegocioId, unitId)))
      .groupBy(cobranzas.cliente, cobranzas.sucursalId);

    return rows.map((r) => ({
      ...r,
      monto: String(r.monto ?? 0),
      saldo: String(r.saldo ?? 0),
    }));
  });
}
