"use server";

import { and, eq, gte, inArray, lt, isNotNull, type SQLWrapper } from "drizzle-orm";
import { cotizaciones, facturas, ventasPerdidas, cumplimientoAsesores } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import type { DateRange, MonthFilter } from "@/lib/date-range";

function inCond(col: SQLWrapper, values: string[]) {
  return values && values.length > 0 ? inArray(col, values) : undefined;
}

export async function getAsesoresRawDataAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  selectedSucursales: string[];
  selectedUnidades: string[];
}) {
  return withAuth(async ({ tx, role, profile }) => {
    const { anio, meses, ranges, selectedSucursales, selectedUnidades } = data;

    const sucursalId =
      role === "coordinador"
        ? profile.sucursalId
        : selectedSucursales.length > 0
          ? selectedSucursales[0]
          : null;

    const cotConds = [
      dateRangeCondition(cotizaciones.fecha, ranges),
      sucursalId ? eq(cotizaciones.sucursalId, sucursalId) : undefined,
      inCond(cotizaciones.unidadNegocioId, selectedUnidades),
    ].filter(Boolean);

    const facConds = [
      dateRangeCondition(facturas.fecha, ranges),
      sucursalId ? eq(facturas.sucursalId, sucursalId) : undefined,
      inCond(facturas.unidadNegocioId, selectedUnidades),
    ].filter(Boolean);

    const vpConds = [
      dateRangeCondition(ventasPerdidas.fecha, ranges),
      sucursalId ? eq(ventasPerdidas.sucursalId, sucursalId) : undefined,
      inCond(ventasPerdidas.unidadNegocioId, selectedUnidades),
    ].filter(Boolean);

    const caConds = [
      eq(cumplimientoAsesores.anio, anio),
      meses !== "all" && Array.isArray(meses) && meses.length > 0
        ? inArray(cumplimientoAsesores.mes, meses)
        : undefined,
      sucursalId ? eq(cumplimientoAsesores.sucursalId, sucursalId) : undefined,
      inCond(cumplimientoAsesores.unidadNegocioId, selectedUnidades),
    ].filter(Boolean);

    const [cotData, facData, vpData, metaData] = await Promise.all([
      tx
        .select({
          asesor_codigo: cotizaciones.asesorCodigo,
          monto: cotizaciones.monto,
          sucursal_id: cotizaciones.sucursalId,
          unidad_negocio_id: cotizaciones.unidadNegocioId,
        })
        .from(cotizaciones)
        .where(and(...cotConds)),
      tx
        .select({
          asesor: facturas.asesor,
          monto: facturas.monto,
          sucursal_id: facturas.sucursalId,
          unidad_negocio_id: facturas.unidadNegocioId,
        })
        .from(facturas)
        .where(and(...facConds)),
      tx
        .select({
          asesor: ventasPerdidas.asesor,
          monto: ventasPerdidas.monto,
          sucursal_id: ventasPerdidas.sucursalId,
          unidad_negocio_id: ventasPerdidas.unidadNegocioId,
        })
        .from(ventasPerdidas)
        .where(and(...vpConds)),
      tx
        .select({
          codigo_asesor: cumplimientoAsesores.codigoAsesor,
          asesor: cumplimientoAsesores.asesor,
          presupuesto: cumplimientoAsesores.presupuesto,
          sucursal_id: cumplimientoAsesores.sucursalId,
          unidad_negocio_id: cumplimientoAsesores.unidadNegocioId,
        })
        .from(cumplimientoAsesores)
        .where(and(...caConds)),
    ]);

    return {
      cotizaciones: cotData.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
      facturas: facData.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
      perdidas: vpData.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
      metas: metaData.map((r) => ({ ...r, presupuesto: Number(r.presupuesto ?? 0) })),
    };
  });
}

export async function getAsesoresDrilldownAction(data: { anio: number }) {
  return withAuth(async ({ tx }) => {
    const { anio } = data;

    const [caAliases, metasRes, facturasRes, cotizacionesRes, perdidasRes] = await Promise.all([
      tx
        .select({
          codigo_asesor: cumplimientoAsesores.codigoAsesor,
          asesor: cumplimientoAsesores.asesor,
        })
        .from(cumplimientoAsesores)
        .where(
          and(isNotNull(cumplimientoAsesores.codigoAsesor), isNotNull(cumplimientoAsesores.asesor)),
        ),
      tx
        .select({
          mes: cumplimientoAsesores.mes,
          presupuesto: cumplimientoAsesores.presupuesto,
          codigo_asesor: cumplimientoAsesores.codigoAsesor,
          asesor: cumplimientoAsesores.asesor,
          sucursal_id: cumplimientoAsesores.sucursalId,
          unidad_negocio_id: cumplimientoAsesores.unidadNegocioId,
        })
        .from(cumplimientoAsesores)
        .where(eq(cumplimientoAsesores.anio, anio)),
      tx
        .select({
          monto: facturas.monto,
          fecha: facturas.fecha,
          asesor: facturas.asesor,
          sucursal_id: facturas.sucursalId,
          unidad_negocio_id: facturas.unidadNegocioId,
        })
        .from(facturas)
        .where(and(gte(facturas.fecha, `${anio}-01-01`), lt(facturas.fecha, `${anio + 1}-01-01`))),
      tx
        .select({
          monto: cotizaciones.monto,
          fecha: cotizaciones.fecha,
          cliente: cotizaciones.cliente,
          descripcion: cotizaciones.descripcion,
          nro_cotizacion: cotizaciones.nroCotizacion,
          etapa: cotizaciones.etapa,
          asesor_codigo: cotizaciones.asesorCodigo,
          sucursal_id: cotizaciones.sucursalId,
          unidad_negocio_id: cotizaciones.unidadNegocioId,
        })
        .from(cotizaciones)
        .where(
          and(
            gte(cotizaciones.fecha, `${anio}-01-01`),
            lt(cotizaciones.fecha, `${anio + 1}-01-01`),
          ),
        ),
      tx
        .select({
          monto: ventasPerdidas.monto,
          fecha: ventasPerdidas.fecha,
          cliente: ventasPerdidas.cliente,
          razon: ventasPerdidas.razon,
          asesor: ventasPerdidas.asesor,
          sucursal_id: ventasPerdidas.sucursalId,
          unidad_negocio_id: ventasPerdidas.unidadNegocioId,
        })
        .from(ventasPerdidas)
        .where(
          and(
            gte(ventasPerdidas.fecha, `${anio}-01-01`),
            lt(ventasPerdidas.fecha, `${anio + 1}-01-01`),
          ),
        ),
    ]);

    return {
      aliases: caAliases,
      metas: metasRes.map((r) => ({ ...r, presupuesto: Number(r.presupuesto ?? 0) })),
      facturas: facturasRes.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
      cotizaciones: cotizacionesRes.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
      perdidas: perdidasRes.map((r) => ({ ...r, monto: Number(r.monto ?? 0) })),
    };
  });
}
