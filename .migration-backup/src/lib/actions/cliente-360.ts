"use server";

import { and, eq, gte, gt, inArray, lt, sum, max, min, type SQLWrapper } from "drizzle-orm";
import { cotizaciones, facturas, ventasPerdidas, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export type Cliente360Fuente = "cotizado" | "facturado" | "perdido";

function unitCond(col: SQLWrapper, unidades: string[]) {
  return unidades && unidades.length > 0 ? inArray(col, unidades) : undefined;
}

function sucursalCond(col: SQLWrapper, sucursalId?: string) {
  return sucursalId && sucursalId !== "all" ? eq(col, sucursalId) : undefined;
}

export async function getCliente360DataAction(data: {
  fuente: Cliente360Fuente;
  anio: number;
  mes: number;
  sucursalId?: string;
  unidades: string[];
}) {
  return withAuth(async ({ tx }) => {
    const { fuente, anio, mes, sucursalId, unidades } = data;

    const desde = mes === 0 ? `${anio}-01-01` : `${anio}-${String(mes).padStart(2, "0")}-01`;
    const hastaAnio = mes === 0 || mes === 12 ? anio + 1 : anio;
    const hastaMes = mes === 0 || mes === 12 ? 1 : mes + 1;
    const hasta = `${hastaAnio}-${String(hastaMes).padStart(2, "0")}-01`;

    const hace90d = new Date();
    hace90d.setDate(hace90d.getDate() - 90);
    const hace90dStr = hace90d.toISOString().slice(0, 10);

    let paretoPromise;
    if (fuente === "cotizado") {
      paretoPromise = tx
        .select({
          cliente: cotizaciones.cliente,
          monto: sum(cotizaciones.monto),
          sucursal_id: cotizaciones.sucursalId,
        })
        .from(cotizaciones)
        .where(
          and(
            gte(cotizaciones.fecha, desde),
            lt(cotizaciones.fecha, hasta),
            sucursalCond(cotizaciones.sucursalId, sucursalId),
            unitCond(cotizaciones.unidadNegocioId, unidades),
          ),
        )
        .groupBy(cotizaciones.cliente, cotizaciones.sucursalId);
    } else if (fuente === "facturado") {
      paretoPromise = tx
        .select({
          cliente: facturas.cliente,
          monto: sum(facturas.monto),
          sucursal_id: facturas.sucursalId,
        })
        .from(facturas)
        .where(
          and(
            gte(facturas.fecha, desde),
            lt(facturas.fecha, hasta),
            sucursalCond(facturas.sucursalId, sucursalId),
            unitCond(facturas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(facturas.cliente, facturas.sucursalId);
    } else {
      paretoPromise = tx
        .select({
          cliente: ventasPerdidas.cliente,
          monto: sum(ventasPerdidas.monto),
          sucursal_id: ventasPerdidas.sucursalId,
        })
        .from(ventasPerdidas)
        .where(
          and(
            gte(ventasPerdidas.fecha, desde),
            lt(ventasPerdidas.fecha, hasta),
            sucursalCond(ventasPerdidas.sucursalId, sucursalId),
            unitCond(ventasPerdidas.unidadNegocioId, unidades),
          ),
        )
        .groupBy(ventasPerdidas.cliente, ventasPerdidas.sucursalId);
    }

    const facturasHealthPromise = tx
      .select({
        cliente: facturas.cliente,
        fecha: max(facturas.fecha),
        monto: sum(facturas.monto),
      })
      .from(facturas)
      .where(
        and(
          sucursalCond(facturas.sucursalId, sucursalId),
          unitCond(facturas.unidadNegocioId, unidades),
        ),
      )
      .groupBy(facturas.cliente);

    const ventasPerdidasHealthPromise = tx
      .select({
        cliente: ventasPerdidas.cliente,
        monto: sum(ventasPerdidas.monto),
      })
      .from(ventasPerdidas)
      .where(
        and(
          gte(ventasPerdidas.fecha, hace90dStr),
          sucursalCond(ventasPerdidas.sucursalId, sucursalId),
          unitCond(ventasPerdidas.unidadNegocioId, unidades),
        ),
      )
      .groupBy(ventasPerdidas.cliente);

    const cobranzasHealthPromise = tx
      .select({
        cliente: cobranzas.cliente,
        saldo: sum(cobranzas.saldo),
        fechaVencimiento: min(cobranzas.fechaVencimiento),
      })
      .from(cobranzas)
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          sucursalCond(cobranzas.sucursalId, sucursalId),
          unitCond(cobranzas.unidadNegocioId, unidades),
        ),
      )
      .groupBy(cobranzas.cliente);

    const [paretoRows, facturasRows, ventasPerdidasRows, cobranzasRows] = await Promise.all([
      paretoPromise,
      facturasHealthPromise,
      ventasPerdidasHealthPromise,
      cobranzasHealthPromise,
    ]);

    return {
      pareto: paretoRows.map((r) => ({
        cliente: r.cliente,
        monto: Number(r.monto ?? 0),
        sucursal_id: r.sucursal_id,
      })),
      facturas: facturasRows.map((r) => ({
        cliente: r.cliente,
        fecha: r.fecha ?? "",
        monto: Number(r.monto ?? 0),
      })),
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
