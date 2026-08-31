"use server";

import { and, eq, gt, inArray, sum, type SQLWrapper } from "drizzle-orm";
import {
  presupuestos,
  cobranzas,
  ventasPerdidas,
  equiposPorMarca,
  equiposInventario,
} from "@/db/schema";
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

// Fuente de verdad del cumplimiento (presupuesto vs facturado) — no `facturas`,
// que es transaccional y no reconciliada. Mismo patrón que servicios/lubfiltros.
export async function getPresupuestosEquiposAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
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
          mesCond(presupuestos.mes, data.meses, data.anio),
          data.sucursal !== "all" ? eq(presupuestos.sucursalId, data.sucursal) : undefined,
          eq(presupuestos.unidadNegocioId, await unidadId("equipos")),
        ),
      );
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
      .select()
      .from(cobranzas)
      .where(and(gt(cobranzas.saldo, "0"), eq(cobranzas.unidadNegocioId, unitId)))
      .orderBy(cobranzas.fechaVencimiento);

    return rows.map((r) => ({
      ...r,
      monto: String(r.monto ?? 0),
      saldo: String(r.saldo ?? 0),
    }));
  });
}

// Participación por marca — hoja "Detalles de Ventas Equipos" (Generac, CAT, EP, Weichai...)
export async function getEquiposPorMarcaAction(data: { anio: number; meses: MonthFilter }) {
  return withAuth(async ({ tx }) => {
    return tx
      .select()
      .from(equiposPorMarca)
      .where(
        and(
          eq(equiposPorMarca.anio, data.anio),
          mesCond(equiposPorMarca.mes, data.meses, data.anio),
        ),
      );
  });
}

// Inventario disponible/tránsito por marca + tipo de equipo — snapshot semanal.
export async function getEquiposInventarioAction() {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("equipos");
    return tx.select().from(equiposInventario).where(eq(equiposInventario.unidadNegocioId, unitId));
  });
}
