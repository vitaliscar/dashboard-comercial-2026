"use server";

import { eq, sql } from "drizzle-orm";
import { presupuestos } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

/** Reemplaza rpc_resumen_mensual — reshape directo de `presupuestos` (meta=monto,
 * facturado=ventas_ccv+ventas_xibi+ventas_estrategicas), filtrado por mes/sucursal/unidad
 * en memoria del lado del cliente (igual que antes). */
export async function getResumenMensualAction(data: { anio: number }) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia" && role !== "gerente_comercial") {
      throw new Error("Unauthorized: Insufficient permissions for gerencia-nacional");
    }

    const rows = await tx
      .select({
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        unidadNegocioId: presupuestos.unidadNegocioId,
        meta: presupuestos.monto,
        facturado: sql<string>`(
          COALESCE(${presupuestos.ventasCcv}, 0) +
          COALESCE(${presupuestos.ventasXibi}, 0) +
          COALESCE(${presupuestos.ventasEstrategicas}, 0)
        )::text`,
      })
      .from(presupuestos)
      .where(eq(presupuestos.anio, data.anio));

    return rows;
  });
}
