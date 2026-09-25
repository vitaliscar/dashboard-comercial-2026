"use server";

import { eq, sql } from "drizzle-orm";
import { presupuestos } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { cargarAjustesManuales, sumaAjuste } from "@/lib/ajustes-manuales-helper";
import { isFullAccessRole } from "@/lib/permissions";

type Tx = Parameters<Parameters<typeof withAuth>[0]>[0]["tx"];

async function cargarResumenMensual(tx: Tx, anio: number) {
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
    .where(eq(presupuestos.anio, anio));

  const ajustes = await cargarAjustesManuales(tx, anio);
  if (ajustes.length === 0) return rows;

  return rows.map((r) => {
    const base = { mes: r.mes, sucursalId: r.sucursalId, unidadNegocioId: r.unidadNegocioId };
    const ajusteTotal =
      sumaAjuste(ajustes, { ...base, columna: "ccv" }) +
      sumaAjuste(ajustes, { ...base, columna: "xibi" }) +
      sumaAjuste(ajustes, { ...base, columna: "estrategico" }) +
      sumaAjuste(ajustes, { ...base, columna: "total" });
    return { ...r, facturado: String(Number(r.facturado) + ajusteTotal) };
  });
}

/** Reemplaza rpc_resumen_mensual — reshape directo de `presupuestos` (meta=monto,
 * facturado=ventas_ccv+ventas_xibi+ventas_estrategicas), filtrado por mes/sucursal/unidad
 * en memoria del lado del cliente (igual que antes). */
export async function getResumenMensualAction(data: { anio: number }) {
  return withAuth(async ({ tx, role }) => {
    if (!isFullAccessRole(role) && role !== "gerente_comercial") {
      throw new Error("Unauthorized: Insufficient permissions for gerencia-nacional");
    }
    return cargarResumenMensual(tx, data.anio);
  });
}

/** Franja de presupuesto por unidad: mismas filas que gerencia-nacional, también para
 * coordinador. RLS recorta a su sucursal; el asesor no ve presupuestos de unidad. */
export async function getPresupuestoStripAction(data: { anio: number }) {
  return withAuth(async ({ tx, role }) => {
    if (!isFullAccessRole(role) && role !== "gerente_comercial" && role !== "coordinador") {
      throw new Error("Unauthorized: Insufficient permissions for presupuesto");
    }
    return cargarResumenMensual(tx, data.anio);
  });
}
