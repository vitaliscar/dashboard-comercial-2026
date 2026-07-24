import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { presupuestos } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";

/** Reemplaza rpc_resumen_mensual — reshape directo de `presupuestos` (meta=monto,
 * facturado=ventas_ccv+ventas_xibi+ventas_estrategicas), filtrado por mes/sucursal/unidad
 * en memoria del lado del cliente (igual que antes). */
export const getResumenMensualFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number }) => data)
  .handler(async ({ context, data }) => {
    const rows = await context.tx
      .select({
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        unidadNegocioId: presupuestos.unidadNegocioId,
        meta: presupuestos.monto,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(eq(presupuestos.anio, data.anio));

    return rows.map((r) => ({
      mes: r.mes,
      sucursalId: r.sucursalId,
      unidadNegocioId: r.unidadNegocioId,
      meta: r.meta,
      facturado: (
        Number(r.ventasCcv) +
        Number(r.ventasXibi) +
        Number(r.ventasEstrategicas)
      ).toString(),
    }));
  });
