"use server";

import { and, eq, gte, lt, gt, inArray, sum, sql, type SQLWrapper } from "drizzle-orm";
import { facturas, presupuestos, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { getAllMonthsCap, type MonthFilter } from "@/lib/date-range";

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

export async function getAlquilerFacturacionAction(data: { anio: number }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("alquiler");
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

export async function getAlquilerPresupuestoAction(data: { anio: number; meses: MonthFilter }) {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("alquiler");
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

export async function getAlquilerClientesCobroAction() {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("alquiler");
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
