"use server";

import { and, eq, gte, lt, gt, inArray, type SQLWrapper } from "drizzle-orm";
import { facturas, presupuestos, cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { gcEquiposAlquilerUnitIds } from "@/lib/actions/unit-scope";
import { getAllMonthsCap, type MonthFilter } from "@/lib/date-range";

function unitCond(col: SQLWrapper, ids: string[] | null) {
  return ids ? inArray(col, ids) : undefined;
}

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

export async function getAlquilerFacturacionAction(data: { anio: number }) {
  return withAuth(async ({ tx, role, profile }) => {
    const unitIds = gcEquiposAlquilerUnitIds(role, profile.unidadesNegocioIds);
    return tx
      .select({ monto: facturas.monto, fecha: facturas.fecha })
      .from(facturas)
      .where(
        and(
          gte(facturas.fecha, `${data.anio}-01-01`),
          lt(facturas.fecha, `${data.anio + 1}-01-01`),
          unitCond(facturas.unidadNegocioId, unitIds),
        ),
      );
  });
}

export async function getAlquilerPresupuestoAction(data: { anio: number; meses: MonthFilter }) {
  return withAuth(async ({ tx, role, profile }) => {
    const unitIds = gcEquiposAlquilerUnitIds(role, profile.unidadesNegocioIds);
    return tx
      .select({ monto: presupuestos.monto })
      .from(presupuestos)
      .where(
        and(
          eq(presupuestos.anio, data.anio),
          mesCond(presupuestos.mes, data.meses, data.anio),
          unitCond(presupuestos.unidadNegocioId, unitIds),
        ),
      );
  });
}

export async function getAlquilerClientesCobroAction() {
  return withAuth(async ({ tx, role, profile }) => {
    const unitIds = gcEquiposAlquilerUnitIds(role, profile.unidadesNegocioIds);
    return tx
      .select()
      .from(cobranzas)
      .where(and(gt(cobranzas.saldo, "0"), unitCond(cobranzas.unidadNegocioId, unitIds)));
  });
}
