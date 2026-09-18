"use server";

import { and, gte, gt, inArray, sum, max, min, sql, type SQLWrapper } from "drizzle-orm";
import { cotizaciones, facturas, ventasPerdidas, cobranzas, servicios } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { getDateRangesForMonths, type MonthFilter } from "@/lib/date-range";
import { dateRangeCondition } from "@/lib/server/query-helpers";

export type Cliente360Fuente = "cotizado" | "facturado" | "perdido";

function unitCond(col: SQLWrapper, unidades: string[]) {
  return unidades.length > 0 ? inArray(col, unidades) : undefined;
}

function sucursalesCond(col: SQLWrapper, sucursales: string[]) {
  return sucursales.length > 0 ? inArray(col, sucursales) : undefined;
}

/** Misma exclusión que Top Clientes en resumen (venta interna, todas las U/N). */
const EXCLURE_CONSORCIO = sql`cliente NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`;

type ParetoRow = { cliente: string; monto: number; sucursal_id: string | null };

function mergeParetoRows(parts: ParetoRow[][]): ParetoRow[] {
  const map = new Map<string, ParetoRow>();
  for (const rows of parts) {
    for (const r of rows) {
      const key = `${r.cliente}\0${r.sucursal_id ?? ""}`;
      const cur = map.get(key);
      if (cur) cur.monto += r.monto;
      else map.set(key, { ...r });
    }
  }
  return Array.from(map.values());
}

export async function getCliente360DataAction(data: {
  fuente: Cliente360Fuente;
  anio: number;
  /** Multi-mes o "all" (YTD). */
  meses: MonthFilter;
  sucursales?: string[];
  sucursalId?: string;
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { fuente, anio, meses, unidades } = data;
    const sucursales =
      data.sucursales && data.sucursales.length > 0
        ? data.sucursales
        : data.sucursalId && data.sucursalId !== "all"
          ? [data.sucursalId]
          : [];

    const ranges = getDateRangesForMonths(anio, meses);
    const fechaFacturas = dateRangeCondition(facturas.fecha, ranges);
    const fechaServicios = dateRangeCondition(servicios.fecha, ranges);
    const fechaCotizaciones = dateRangeCondition(cotizaciones.fecha, ranges);
    const fechaVentasPerdidas = dateRangeCondition(ventasPerdidas.fecha, ranges);

    const hace90d = new Date();
    hace90d.setDate(hace90d.getDate() - 90);
    const hace90dStr = hace90d.toISOString().slice(0, 10);

    let pareto: ParetoRow[] = [];

    if (fuente === "cotizado") {
      const rows = await tx
        .select({
          cliente: cotizaciones.cliente,
          monto: sum(cotizaciones.monto),
          sucursal_id: cotizaciones.sucursalId,
        })
        .from(cotizaciones)
        .where(
          and(
            fechaCotizaciones,
            sucursalesCond(cotizaciones.sucursalId, sucursales),
            unitCond(cotizaciones.unidadNegocioId, unidades),
            EXCLURE_CONSORCIO,
          ),
        )
        .groupBy(cotizaciones.cliente, cotizaciones.sucursalId);
      pareto = rows.map((r) => ({
        cliente: r.cliente,
        monto: Number(r.monto ?? 0),
        sucursal_id: r.sucursal_id,
      }));
    } else if (fuente === "facturado") {
      // Misma lógica que Top Clientes Facturados en Resumen:
      // - facturas = detalle transaccional (Xibi/Otra Empresa, etc.)
      // - servicios = detalle CCV AS400 (la mayoría del facturado de Servicios)
      // Sin la tabla servicios, filtrar "Servicios + agosto" deja ~2 clientes.
      const [facRows, servRows] = await Promise.all([
        tx
          .select({
            cliente: facturas.cliente,
            monto: sum(facturas.monto),
            sucursal_id: facturas.sucursalId,
          })
          .from(facturas)
          .where(
            and(
              fechaFacturas,
              sucursalesCond(facturas.sucursalId, sucursales),
              unitCond(facturas.unidadNegocioId, unidades),
              EXCLURE_CONSORCIO,
            ),
          )
          .groupBy(facturas.cliente, facturas.sucursalId),
        tx
          .select({
            cliente: servicios.cliente,
            monto: sum(servicios.monto),
            sucursal_id: servicios.sucursalId,
          })
          .from(servicios)
          .where(
            and(
              fechaServicios,
              sucursalesCond(servicios.sucursalId, sucursales),
              unitCond(servicios.unidadNegocioId, unidades),
              EXCLURE_CONSORCIO,
            ),
          )
          .groupBy(servicios.cliente, servicios.sucursalId),
      ]);
      pareto = mergeParetoRows([
        facRows.map((r) => ({
          cliente: r.cliente,
          monto: Number(r.monto ?? 0),
          sucursal_id: r.sucursal_id,
        })),
        servRows.map((r) => ({
          cliente: r.cliente,
          monto: Number(r.monto ?? 0),
          sucursal_id: r.sucursal_id,
        })),
      ]);
    } else {
      const rows = await tx
        .select({
          cliente: ventasPerdidas.cliente,
          monto: sum(ventasPerdidas.monto),
          sucursal_id: ventasPerdidas.sucursalId,
        })
        .from(ventasPerdidas)
        .where(
          and(
            fechaVentasPerdidas,
            sucursalesCond(ventasPerdidas.sucursalId, sucursales),
            unitCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(ventasPerdidas.cliente, ventasPerdidas.sucursalId);
      pareto = rows.map((r) => ({
        cliente: r.cliente,
        monto: Number(r.monto ?? 0),
        sucursal_id: r.sucursal_id,
      }));
    }

    // LTV del periodo: facturas + servicios (misma fuente que Top Clientes facturado).
    const [facLtv, servLtv, ventasPerdidasRows, cobranzasRows] = await Promise.all([
      tx
        .select({
          cliente: facturas.cliente,
          fecha: max(facturas.fecha),
          monto: sum(facturas.monto),
        })
        .from(facturas)
        .where(
          and(
            fechaFacturas,
            sucursalesCond(facturas.sucursalId, sucursales),
            unitCond(facturas.unidadNegocioId, unidades),
            EXCLURE_CONSORCIO,
          ),
        )
        .groupBy(facturas.cliente),
      tx
        .select({
          cliente: servicios.cliente,
          fecha: max(servicios.fecha),
          monto: sum(servicios.monto),
        })
        .from(servicios)
        .where(
          and(
            fechaServicios,
            sucursalesCond(servicios.sucursalId, sucursales),
            unitCond(servicios.unidadNegocioId, unidades),
            EXCLURE_CONSORCIO,
          ),
        )
        .groupBy(servicios.cliente),
      tx
        .select({
          cliente: ventasPerdidas.cliente,
          monto: sum(ventasPerdidas.monto),
        })
        .from(ventasPerdidas)
        .where(
          and(
            gte(ventasPerdidas.fecha, hace90dStr),
            sucursalesCond(ventasPerdidas.sucursalId, sucursales),
            unitCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(ventasPerdidas.cliente),
      tx
        .select({
          cliente: cobranzas.cliente,
          saldo: sum(cobranzas.saldo),
          fechaVencimiento: min(cobranzas.fechaVencimiento),
        })
        .from(cobranzas)
        .where(
          and(
            gt(cobranzas.saldo, "0"),
            sucursalesCond(cobranzas.sucursalId, sucursales),
            unitCond(cobranzas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(cobranzas.cliente),
    ]);

    const ltvMap = new Map<string, { cliente: string; fecha: string; monto: number }>();
    for (const r of [...facLtv, ...servLtv]) {
      const key = r.cliente;
      const monto = Number(r.monto ?? 0);
      const fecha = r.fecha ?? "";
      const cur = ltvMap.get(key);
      if (!cur) {
        ltvMap.set(key, { cliente: key, fecha, monto });
      } else {
        cur.monto += monto;
        if (fecha && (!cur.fecha || fecha > cur.fecha)) cur.fecha = fecha;
      }
    }

    return {
      pareto,
      facturas: Array.from(ltvMap.values()),
      ventasPerdidas: ventasPerdidasRows.map((r) => ({
        cliente: r.cliente,
        monto: Number(r.monto ?? 0),
      })),
      cobranzas: cobranzasRows.map((r) => ({
        cliente: r.cliente,
        saldo: String(r.saldo ?? 0),
        fechaVencimiento: r.fechaVencimiento ?? "",
      })),
    };
  });
}
