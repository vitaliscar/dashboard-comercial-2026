"use server";

import { and, eq, gte, lt, inArray, sum, count, sql } from "drizzle-orm";
import {
  cotizaciones,
  facturas,
  ventasPerdidas,
  servicios,
  presupuestos,
  cumplimientoAsesores,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { dateRangeCondition } from "@/lib/server/query-helpers";
import { getAllMonthsCap, type DateRange, type MonthFilter } from "@/lib/date-range";
import { aplicarAjustesAPresupuestos, cargarAjustesManuales } from "@/lib/ajustes-manuales-helper";

export async function getResumenDataAction(data: {
  anio: number;
  meses: MonthFilter;
  ranges: DateRange[];
  sucursalId?: string;
  prevMonthRanges?: DateRange[];
}) {
  return withAuth(async ({ tx, role }) => {
    const { anio, meses, ranges, sucursalId, prevMonthRanges = [] } = data;
    const sucCond = <T extends { sucursalId: unknown }>(col: T["sucursalId"]) =>
      sucursalId ? eq(col as never, sucursalId) : undefined;

    const cotCond = and(
      dateRangeCondition(cotizaciones.fecha, ranges),
      sucCond(cotizaciones.sucursalId),
    );
    const cotPrevCond =
      prevMonthRanges.length > 0
        ? and(
            dateRangeCondition(cotizaciones.fecha, prevMonthRanges),
            sucCond(cotizaciones.sucursalId),
          )
        : undefined;
    const facCond = and(dateRangeCondition(facturas.fecha, ranges), sucCond(facturas.sucursalId));
    const vpCond = and(
      dateRangeCondition(ventasPerdidas.fecha, ranges),
      sucCond(ventasPerdidas.sucursalId),
    );
    const vpPrevCond =
      prevMonthRanges.length > 0
        ? and(
            dateRangeCondition(ventasPerdidas.fecha, prevMonthRanges),
            sucCond(ventasPerdidas.sucursalId),
          )
        : undefined;
    const servCond = and(
      dateRangeCondition(servicios.fecha, ranges),
      sucCond(servicios.sucursalId),
    );

    const mesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              presupuestos.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(presupuestos.mes, meses);

    const caMesCond =
      meses === "all"
        ? getAllMonthsCap(anio) === 12
          ? undefined
          : inArray(
              cumplimientoAsesores.mes,
              Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1),
            )
        : inArray(cumplimientoAsesores.mes, meses);

    const [
      cot,
      cotPrev,
      cotMensual,
      cotClientes,
      fac,
      facClientes,
      vp,
      vpPrev,
      vpClientes,
      vpRazones,
      serv,
      serviciosClientes,
      pre,
      ca,
    ] = await Promise.all([
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          montoTotal: sum(cotizaciones.monto),
          cantidad: count(cotizaciones.id),
        })
        .from(cotizaciones)
        .where(cotCond)
        .groupBy(cotizaciones.unidadNegocioId),
      cotPrevCond
        ? tx
            .select({
              unidadNegocioId: cotizaciones.unidadNegocioId,
              montoTotal: sum(cotizaciones.monto),
            })
            .from(cotizaciones)
            .where(cotPrevCond)
            .groupBy(cotizaciones.unidadNegocioId)
        : Promise.resolve([]),
      // Cotizado mes a mes en el año completo (independiente del filtro de mes
      // seleccionado) — alimenta la línea de tiempo de la tarjeta de Cotizaciones.
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          mes: sql<number>`extract(month from ${cotizaciones.fecha})::int`,
          montoTotal: sum(cotizaciones.monto),
        })
        .from(cotizaciones)
        .where(
          and(
            gte(cotizaciones.fecha, `${anio}-01-01`),
            lt(cotizaciones.fecha, `${anio + 1}-01-01`),
            sucCond(cotizaciones.sucursalId),
          ),
        )
        .groupBy(cotizaciones.unidadNegocioId, sql`extract(month from ${cotizaciones.fecha})`),
      // Excluye "Consorcio de Cogestion Venequip" como cliente -- mismo
      // motivo que en Top Clientes de Servicios (venta interna, no un
      // cliente real). No se toca cotCond (usado tambien para los totales
      // agregados). Confirmado 2026-09-18: aparecia tambien en Cotizados y
      // Facturados de Lubricantes/Filtros ademas de Servicios.
      tx
        .select({
          unidadNegocioId: cotizaciones.unidadNegocioId,
          sucursalId: cotizaciones.sucursalId,
          cliente: cotizaciones.cliente,
          montoTotal: sum(cotizaciones.monto),
        })
        .from(cotizaciones)
        .where(and(cotCond, sql`${cotizaciones.cliente} NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`))
        .groupBy(cotizaciones.unidadNegocioId, cotizaciones.sucursalId, cotizaciones.cliente),
      tx
        .select({
          unidadNegocioId: facturas.unidadNegocioId,
          montoTotal: sum(facturas.monto),
          cantidad: count(facturas.id),
        })
        .from(facturas)
        .where(facCond)
        .groupBy(facturas.unidadNegocioId),
      // Misma exclusion que arriba, para Top Clientes Facturados.
      tx
        .select({
          unidadNegocioId: facturas.unidadNegocioId,
          sucursalId: facturas.sucursalId,
          cliente: facturas.cliente,
          montoTotal: sum(facturas.monto),
        })
        .from(facturas)
        .where(and(facCond, sql`${facturas.cliente} NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`))
        .groupBy(facturas.unidadNegocioId, facturas.sucursalId, facturas.cliente),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          montoTotal: sum(ventasPerdidas.monto),
          cantidad: count(ventasPerdidas.id),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId),
      vpPrevCond
        ? tx
            .select({
              unidadNegocioId: ventasPerdidas.unidadNegocioId,
              montoTotal: sum(ventasPerdidas.monto),
            })
            .from(ventasPerdidas)
            .where(vpPrevCond)
            .groupBy(ventasPerdidas.unidadNegocioId)
        : Promise.resolve([]),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          sucursalId: ventasPerdidas.sucursalId,
          cliente: ventasPerdidas.cliente,
          montoTotal: sum(ventasPerdidas.monto),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId, ventasPerdidas.sucursalId, ventasPerdidas.cliente),
      tx
        .select({
          unidadNegocioId: ventasPerdidas.unidadNegocioId,
          razon: ventasPerdidas.razon,
          montoTotal: sum(ventasPerdidas.monto),
          cantidad: count(ventasPerdidas.id),
        })
        .from(ventasPerdidas)
        .where(vpCond)
        .groupBy(ventasPerdidas.unidadNegocioId, ventasPerdidas.razon),
      tx
        .select({
          unidadNegocioId: servicios.unidadNegocioId,
          montoTotal: sum(servicios.monto),
          cantidad: count(servicios.id),
        })
        .from(servicios)
        .where(servCond)
        .groupBy(servicios.unidadNegocioId),
      // Top Clientes de Servicios: facturas solo trae el lado Xibi/Otra
      // Empresa -- el detalle CCV vive en servicios (AS400).
      //
      // Excluye "Consorcio de Cogestión Venequip" como cliente: es venta
      // interna (la compañía facturándose servicios a sí misma), ya
      // contabilizada aparte en `servicios_interno` -- listarla en el top de
      // clientes reales confunde al usuario final. No se toca `servCond`
      // (usado también para los totales agregados) para no alterar esas
      // cifras sin que se haya pedido -- el usuario solo reportó el gap en
      // el top de clientes, confirmado 2026-09-18.
      tx
        .select({
          unidadNegocioId: servicios.unidadNegocioId,
          sucursalId: servicios.sucursalId,
          cliente: servicios.cliente,
          montoTotal: sum(servicios.monto),
        })
        .from(servicios)
        .where(and(servCond, sql`${servicios.cliente} NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`))
        .groupBy(servicios.unidadNegocioId, servicios.sucursalId, servicios.cliente),
      tx
        .select()
        .from(presupuestos)
        .where(and(eq(presupuestos.anio, anio), mesCond, sucCond(presupuestos.sucursalId))),
      role === "asesor"
        ? tx
            .select({
              mes: cumplimientoAsesores.mes,
              presupuesto: cumplimientoAsesores.presupuesto,
              venta: cumplimientoAsesores.venta,
              unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
            })
            .from(cumplimientoAsesores)
            .where(and(eq(cumplimientoAsesores.anio, anio), caMesCond))
        : Promise.resolve([]),
    ]);

    const ajustes = await cargarAjustesManuales(tx, anio);

    return {
      cotizaciones: cot,
      cotizacionesPrevMonth: cotPrev,
      cotizacionesMensual: cotMensual,
      cotizacionesClientes: cotClientes,
      facturas: fac,
      facturasClientes: facClientes,
      ventasPerdidas: vp,
      ventasPerdidasPrevMonth: vpPrev,
      ventasPerdidasClientes: vpClientes,
      ventasPerdidasRazones: vpRazones,
      servicios: serv,
      serviciosClientes,
      presupuestos: aplicarAjustesAPresupuestos(pre, ajustes),
      cumplimientoAsesor: ca,
    };
  });
}
