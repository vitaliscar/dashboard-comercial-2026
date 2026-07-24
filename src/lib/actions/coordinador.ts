"use server";

import { and, eq, gt, inArray, type SQLWrapper } from "drizzle-orm";
import {
  presupuestos,
  cobranzas,
  cotizaciones,
  facturas,
  minutas,
  cumplimientoAsesores,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange, MonthFilter } from "@/lib/date-range";

function inCond(col: SQLWrapper, values: string[]) {
  return values && values.length > 0 ? inArray(col, values) : undefined;
}

export async function getCoordinadorYearAction(data: { anio: number }) {
  return withAuth(async ({ tx, role, profile }) => {
    const sucursalId = role === "coordinador" ? profile.sucursalId : null;

    const rows = await tx
      .select({
        monto: presupuestos.monto,
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
          sucursalId ? eq(presupuestos.sucursalId, sucursalId) : undefined,
        ),
      );

    return { presupuestos: rows };
  });
}

export async function getCoordinadorCobranzasAction() {
  return withAuth(async ({ tx, role, profile }) => {
    const sucursalId = role === "coordinador" ? profile.sucursalId : null;

    const rows = await tx
      .select({
        cliente: cobranzas.cliente,
        monto: cobranzas.monto,
        saldo: cobranzas.saldo,
        unidadNegocioId: cobranzas.unidadNegocioId,
      })
      .from(cobranzas)
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          sucursalId ? eq(cobranzas.sucursalId, sucursalId) : undefined,
        ),
      );

    return rows;
  });
}

export async function getCoordinadorScorecardAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  unidades: string[];
}) {
  return withAuth(async ({ tx, role, profile }) => {
    const sucursalId = role === "coordinador" ? profile.sucursalId : null;
    const { anio, meses, ranges, unidades } = data;

    const cotConds = [
      dateRangeCondition(cotizaciones.fecha, ranges),
      sucursalId ? eq(cotizaciones.sucursalId, sucursalId) : undefined,
      inCond(cotizaciones.unidadNegocioId, unidades),
    ].filter(Boolean);

    const facConds = [
      dateRangeCondition(facturas.fecha, ranges),
      sucursalId ? eq(facturas.sucursalId, sucursalId) : undefined,
      inCond(facturas.unidadNegocioId, unidades),
    ].filter(Boolean);

    const minConds = [
      dateRangeCondition(minutas.fecha, ranges),
      sucursalId ? eq(minutas.sucursalId, sucursalId) : undefined,
      inCond(minutas.unidadNegocioId, unidades),
    ].filter(Boolean);

    const caConds = [
      eq(cumplimientoAsesores.anio, anio),
      meses !== "all" && Array.isArray(meses) && meses.length > 0
        ? inArray(cumplimientoAsesores.mes, meses)
        : undefined,
      sucursalId ? eq(cumplimientoAsesores.sucursalId, sucursalId) : undefined,
      inCond(cumplimientoAsesores.unidadNegocioId, unidades),
    ].filter(Boolean);

    const [c, f, m, a] = await Promise.all([
      tx
        .select({ asesorCodigo: cotizaciones.asesorCodigo, monto: cotizaciones.monto })
        .from(cotizaciones)
        .where(and(...cotConds)),
      tx
        .select({ asesor: facturas.asesor, monto: facturas.monto })
        .from(facturas)
        .where(and(...facConds)),
      tx
        .select({ responsable: minutas.responsable, estado: minutas.estado })
        .from(minutas)
        .where(and(...minConds)),
      tx
        .select({
          codigoAsesor: cumplimientoAsesores.codigoAsesor,
          asesor: cumplimientoAsesores.asesor,
          venta: cumplimientoAsesores.venta,
          pctCumplimiento: cumplimientoAsesores.pctCumplimiento,
          pctParticipacion: cumplimientoAsesores.pctParticipacion,
        })
        .from(cumplimientoAsesores)
        .where(and(...caConds)),
    ]);

    return {
      cotizaciones: c,
      facturas: f,
      minutas: m,
      asesores: a,
    };
  });
}
