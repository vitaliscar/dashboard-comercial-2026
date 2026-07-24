"use server";

import { gte, gt } from "drizzle-orm";
import { facturas, ventasPerdidas, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

/** RLS (can_read_row) ya aplica el scoping por rol dentro de la transacción —
 * no hace falta el helper `scoped()` de la versión Supabase. */
export async function getCliente360DataAction() {
  return withAuth(async ({ tx }) => {
    const hace90d = new Date();
    hace90d.setDate(hace90d.getDate() - 90);
    const hace90dStr = hace90d.toISOString().slice(0, 10);

    const [facturasRows, ventasPerdidasRows, cobranzasRows] = await Promise.all([
      tx
        .select({ cliente: facturas.cliente, fecha: facturas.fecha, monto: facturas.monto })
        .from(facturas),
      tx
        .select({
          cliente: ventasPerdidas.cliente,
          fecha: ventasPerdidas.fecha,
          monto: ventasPerdidas.monto,
        })
        .from(ventasPerdidas)
        .where(gte(ventasPerdidas.fecha, hace90dStr)),
      tx
        .select({
          cliente: cobranzas.cliente,
          saldo: cobranzas.saldo,
          fechaVencimiento: cobranzas.fechaVencimiento,
        })
        .from(cobranzas)
        .where(gt(cobranzas.saldo, "0")),
    ]);

    return { facturas: facturasRows, ventasPerdidas: ventasPerdidasRows, cobranzas: cobranzasRows };
  });
}
