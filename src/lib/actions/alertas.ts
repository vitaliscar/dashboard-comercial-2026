"use server";

import { and, eq, gt, gte, inArray, type SQLWrapper } from "drizzle-orm";
import {
  cobranzas,
  ventasPerdidas,
  minutas,
  cumplimientoAsesores,
  cotizaciones,
  facturas,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";

function unitCond(col: SQLWrapper, unidades: string[]) {
  return unidades.length > 0 ? inArray(col, unidades) : undefined;
}

function sucursalCond(col: SQLWrapper, sucursales: string[]) {
  return sucursales.length > 0 ? inArray(col, sucursales) : undefined;
}

export async function getAlertasSourcesAction(data: {
  anio: number;
  meses: MonthFilter;
  unidades: string[];
  sucursales?: string[];
  ranges: DateRange[];
}) {
  return withAuth(async ({ tx }) => {
    const { anio, meses, unidades, ranges } = data;
    const sucursales = data.sucursales ?? [];
    const from60 = new Date();
    from60.setDate(from60.getDate() - 60);
    const from60Str = from60.toISOString().slice(0, 10);

    const mesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              cumplimientoAsesores.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(cumplimientoAsesores.mes, meses);

    const [c, v, m, a, cot, fac] = await Promise.all([
      tx
        .select({
          id: cobranzas.id,
          cliente: cobranzas.cliente,
          facturaNumero: cobranzas.facturaNumero,
          fechaVencimiento: cobranzas.fechaVencimiento,
          saldo: cobranzas.saldo,
          unidadNegocioId: cobranzas.unidadNegocioId,
        })
        .from(cobranzas)
        .where(
          and(
            gt(cobranzas.saldo, "0"),
            unitCond(cobranzas.unidadNegocioId, unidades),
            sucursalCond(cobranzas.sucursalId, sucursales),
          ),
        ),
      tx
        .select({
          id: ventasPerdidas.id,
          cliente: ventasPerdidas.cliente,
          fecha: ventasPerdidas.fecha,
          monto: ventasPerdidas.monto,
          asesor: ventasPerdidas.asesor,
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
        })
        .from(ventasPerdidas)
        .where(
          and(
            gte(ventasPerdidas.fecha, from60Str),
            unitCond(ventasPerdidas.unidadNegocioId, unidades),
            sucursalCond(ventasPerdidas.sucursalId, sucursales),
          ),
        ),
      tx
        .select({
          id: minutas.id,
          cliente: minutas.cliente,
          descripcion: minutas.descripcion,
          fechaLimite: minutas.fechaLimite,
          estado: minutas.estado,
          responsable: minutas.responsable,
          unidadNegocioId: minutas.unidadNegocioId,
        })
        .from(minutas)
        .where(
          and(
            unitCond(minutas.unidadNegocioId, unidades),
            sucursalCond(minutas.sucursalId, sucursales),
          ),
        ),
      tx
        .select({
          id: cumplimientoAsesores.id,
          asesor: cumplimientoAsesores.asesor,
          codigoAsesor: cumplimientoAsesores.codigoAsesor,
          pctCumplimiento: cumplimientoAsesores.pctCumplimiento,
          venta: cumplimientoAsesores.venta,
          presupuesto: cumplimientoAsesores.presupuesto,
          unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
        })
        .from(cumplimientoAsesores)
        .where(
          and(
            eq(cumplimientoAsesores.anio, anio),
            mesCond,
            unitCond(cumplimientoAsesores.unidadNegocioId, unidades),
            sucursalCond(cumplimientoAsesores.sucursalId, sucursales),
          ),
        ),
      tx
        .select({
          id: cotizaciones.id,
          cliente: cotizaciones.cliente,
          asesorCodigo: cotizaciones.asesorCodigo,
          etapa: cotizaciones.etapa,
          monto: cotizaciones.monto,
          fecha: cotizaciones.fecha,
          unidadNegocioId: cotizaciones.unidadNegocioId,
        })
        .from(cotizaciones)
        .where(
          and(
            dateRangeCondition(cotizaciones.fecha, ranges),
            unitCond(cotizaciones.unidadNegocioId, unidades),
            sucursalCond(cotizaciones.sucursalId, sucursales),
          ),
        ),
      tx
        .select({
          id: facturas.id,
          cliente: facturas.cliente,
          asesor: facturas.asesor,
          monto: facturas.monto,
          unidadNegocioId: facturas.unidadNegocioId,
        })
        .from(facturas)
        .where(
          and(
            dateRangeCondition(facturas.fecha, ranges),
            unitCond(facturas.unidadNegocioId, unidades),
            sucursalCond(facturas.sucursalId, sucursales),
          ),
        ),
    ]);

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedRunRate = (now.getDate() / daysInMonth) * 100;
    const today = now.toISOString().slice(0, 10);
    const next7 = new Date();
    next7.setDate(now.getDate() + 7);

    return {
      expectedRunRate,
      today,
      next7: next7.toISOString().slice(0, 10),
      cobranzas: c,
      perdidas: v,
      minutas: m,
      asesores: a,
      cotizaciones: cot,
      facturas: fac,
    };
  });
}
