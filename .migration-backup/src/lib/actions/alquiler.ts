"use server";

import { and, eq, gt, inArray, type SQLWrapper } from "drizzle-orm";
import { presupuestos, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { unidadId } from "@/lib/server/unidades";
import { getAllMonthsCap, type MonthFilter } from "@/lib/date-range";

function mesCond(col: SQLWrapper, meses: MonthFilter, anio: number) {
  if (meses === "all") {
    const cap = getAllMonthsCap(anio);
    return cap === 12
      ? undefined
      : inArray(
          col,
          Array.from({ length: cap }, (_, i) => i + 1),
        );
  }
  return inArray(col, meses);
}

// Fuente de verdad del cumplimiento (presupuesto vs facturado) — no `facturas`,
// que es transaccional y no reconciliada. Mismo patrón que servicios/lubfiltros/equipos.
export async function getPresupuestosAlquilerAction(data: {
  anio: number;
  meses: MonthFilter;
  sucursal: string | "all";
}) {
  return withAuth(async ({ tx }) => {
    return tx
      .select({
        id: presupuestos.id,
        anio: presupuestos.anio,
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        monto: presupuestos.monto,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          mesCond(presupuestos.mes, data.meses, data.anio),
          data.sucursal !== "all" ? eq(presupuestos.sucursalId, data.sucursal) : undefined,
          eq(presupuestos.unidadNegocioId, await unidadId("alquiler")),
        ),
      );
  });
}

export async function getAlquilerClientesCobroAction() {
  return withAuth(async ({ tx }) => {
    const unitId = await unidadId("alquiler");
    return tx
      .select()
      .from(cobranzas)
      .where(and(gt(cobranzas.saldo, "0"), eq(cobranzas.unidadNegocioId, unitId)))
      .orderBy(cobranzas.fechaVencimiento);
  });
}
