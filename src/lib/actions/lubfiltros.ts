"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import {
  presupuestos,
  cobranzas,
  detallesVentasLubfiltros,
  inventarioLubfiltros,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { getAllMonthsCap, type MonthFilter } from "@/lib/date-range";

// Fuente de verdad del cumplimiento (presupuesto vs facturado) — no `facturas`,
// que es transaccional y no reconciliada. Mismo patrón que servicios.ts.
export async function getPresupuestosLubfiltrosAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
    const monthCap = getAllMonthsCap(data.anio);
    const monthCond = Array.isArray(data.meses)
      ? inArray(presupuestos.mes, data.meses)
      : monthCap === 12
        ? undefined
        : inArray(
            presupuestos.mes,
            Array.from({ length: monthCap }, (_, i) => i + 1),
          );

    return tx
      .select({
        id: presupuestos.id,
        anio: presupuestos.anio,
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        monto: presupuestos.monto,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          monthCond,
          data.sucursal !== "all" ? eq(presupuestos.sucursalId, data.sucursal) : undefined,
          eq(presupuestos.unidadNegocioId, await unidadId("lubfiltros")),
        ),
      );
  });
}

export async function getCobranzasLubfiltrosAction(data: { sucursal: string | "all" }) {
  return withAuth(async ({ tx }) => {
    return tx
      .select()
      .from(cobranzas)
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          data.sucursal !== "all" ? eq(cobranzas.sucursalId, data.sucursal) : undefined,
          eq(cobranzas.unidadNegocioId, await unidadId("lubfiltros")),
        ),
      )
      .orderBy(cobranzas.fechaVencimiento);
  });
}

// Detalle de ventas por marca (Chronus, Donaldson, Donaldson Industrial, Otra
// Marca) x mes — hoja "Detalles de Ventas LUBFILTROS", sin filtro de sucursal
// (el Excel fuente no la trae a este nivel).
export async function getDetallesVentasLubfiltrosAction(data: { meses: MonthFilter }) {
  return withAuth(async ({ tx }) => {
    const isAllMonths = data.meses === "all";
    const monthList = Array.isArray(data.meses) ? data.meses : [];
    return tx
      .select()
      .from(detallesVentasLubfiltros)
      .where(
        !isAllMonths && monthList.length > 0
          ? inArray(detallesVentasLubfiltros.mes, monthList)
          : undefined,
      );
  });
}

// Inventario Lubricantes vs Filtros por sucursal — hoja "Inventario LubFiltros".
// Snapshot semanal, sin dimensión de fecha/mes.
export async function getInventarioLubfiltrosAction() {
  return withAuth(async ({ tx }) => {
    return tx.select().from(inventarioLubfiltros);
  });
}
