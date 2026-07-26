"use server";

import { and, eq, gt, inArray, sum, count, max, type SQLWrapper } from "drizzle-orm";
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
        monto: sum(presupuestos.monto),
        mes: presupuestos.mes,
        unidadNegocioId: presupuestos.unidadNegocioId,
        ventasCcv: sum(presupuestos.ventasCcv),
        ventasXibi: sum(presupuestos.ventasXibi),
        ventasEstrategicas: sum(presupuestos.ventasEstrategicas),
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          sucursalId ? eq(presupuestos.sucursalId, sucursalId) : undefined,
        ),
      )
      .groupBy(presupuestos.mes, presupuestos.unidadNegocioId);

    return {
      presupuestos: rows.map((r) => ({
        ...r,
        monto: Number(r.monto ?? 0),
        ventasCcv: Number(r.ventasCcv ?? 0),
        ventasXibi: Number(r.ventasXibi ?? 0),
        ventasEstrategicas: Number(r.ventasEstrategicas ?? 0),
      })),
    };
  });
}

export async function getCoordinadorCobranzasAction() {
  return withAuth(async ({ tx, role, profile }) => {
    const sucursalId = role === "coordinador" ? profile.sucursalId : null;

    const rows = await tx
      .select({
        cliente: cobranzas.cliente,
        monto: sum(cobranzas.monto),
        saldo: sum(cobranzas.saldo),
        unidadNegocioId: cobranzas.unidadNegocioId,
      })
      .from(cobranzas)
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          sucursalId ? eq(cobranzas.sucursalId, sucursalId) : undefined,
        ),
      )
      .groupBy(cobranzas.cliente, cobranzas.unidadNegocioId);

    return rows.map((r) => ({
      ...r,
      monto: String(r.monto ?? 0),
      saldo: String(r.saldo ?? 0),
    }));
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
        .select({
          asesorCodigo: cotizaciones.asesorCodigo,
          monto: sum(cotizaciones.monto),
          cantidad: count(cotizaciones.id),
        })
        .from(cotizaciones)
        .where(and(...cotConds))
        .groupBy(cotizaciones.asesorCodigo),
      tx
        .select({
          asesor: facturas.asesor,
          monto: sum(facturas.monto),
          cantidad: count(facturas.id),
        })
        .from(facturas)
        .where(and(...facConds))
        .groupBy(facturas.asesor),
      tx
        .select({
          responsable: minutas.responsable,
          estado: minutas.estado,
          cantidad: count(minutas.id),
        })
        .from(minutas)
        .where(and(...minConds))
        .groupBy(minutas.responsable, minutas.estado),
      tx
        .select({
          codigoAsesor: cumplimientoAsesores.codigoAsesor,
          asesor: cumplimientoAsesores.asesor,
          venta: sum(cumplimientoAsesores.venta),
          pctCumplimiento: max(cumplimientoAsesores.pctCumplimiento),
          pctParticipacion: max(cumplimientoAsesores.pctParticipacion),
        })
        .from(cumplimientoAsesores)
        .where(and(...caConds))
        .groupBy(cumplimientoAsesores.codigoAsesor, cumplimientoAsesores.asesor),
    ]);

    return {
      cotizaciones: c.map((r) => ({
        ...r,
        monto: Number(r.monto ?? 0),
        cantidad: Number(r.cantidad ?? 0),
      })),
      facturas: f.map((r) => ({
        ...r,
        monto: Number(r.monto ?? 0),
        cantidad: Number(r.cantidad ?? 0),
      })),
      minutas: m.map((r) => ({ ...r, cantidad: Number(r.cantidad ?? 0) })),
      asesores: a.map((r) => ({
        ...r,
        venta: Number(r.venta ?? 0),
        pctCumplimiento: Number(r.pctCumplimiento ?? 0),
        pctParticipacion: Number(r.pctParticipacion ?? 0),
      })),
    };
  });
}
