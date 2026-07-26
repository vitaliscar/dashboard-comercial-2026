"use server";

import { gte, gt, sum, max, min } from "drizzle-orm";
import { facturas, ventasPerdidas, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

/** RLS (can_read_row) ya aplica el scoping por rol dentro de la transacción */
export async function getCliente360DataAction() {
  return withAuth(async ({ tx }) => {
    const hace90d = new Date();
    hace90d.setDate(hace90d.getDate() - 90);
    const hace90dStr = hace90d.toISOString().slice(0, 10);

    const [facturasRows, ventasPerdidasRows, cobranzasRows] = await Promise.all([
      tx
        .select({
          cliente: facturas.cliente,
          fecha: max(facturas.fecha),
          monto: sum(facturas.monto),
        })
        .from(facturas)
        .groupBy(facturas.cliente),
      tx
        .select({
          cliente: ventasPerdidas.cliente,
          monto: sum(ventasPerdidas.monto),
        })
        .from(ventasPerdidas)
        .where(gte(ventasPerdidas.fecha, hace90dStr))
        .groupBy(ventasPerdidas.cliente),
      tx
        .select({
          cliente: cobranzas.cliente,
          saldo: sum(cobranzas.saldo),
          fechaVencimiento: min(cobranzas.fechaVencimiento),
        })
        .from(cobranzas)
        .where(gt(cobranzas.saldo, "0"))
        .groupBy(cobranzas.cliente),
    ]);

    return {
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
