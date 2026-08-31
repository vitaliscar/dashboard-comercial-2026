"use server";

import { and, eq, inArray } from "drizzle-orm";
import { comisionesReglas, cumplimientoAsesores } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { canAccessModule } from "@/lib/permissions";
import type { MonthFilter } from "@/lib/date-range";

export async function getComisionesReglasAction() {
  return withAuth(({ tx, role }) => {
    if (!canAccessModule(role, "comisiones")) {
      throw new Error("Unauthorized: sin acceso al módulo de comisiones");
    }
    return tx.select().from(comisionesReglas);
  });
}

export async function getComisionesCumplimientoAction(data: {
  anio: number;
  meses: MonthFilter;
  unidades: string[];
}) {
  return withAuth(({ tx, role }) => {
    if (!canAccessModule(role, "comisiones")) {
      throw new Error("Unauthorized: sin acceso al módulo de comisiones");
    }
    const conditions = [eq(cumplimientoAsesores.anio, data.anio)];
    if (data.meses !== "all") conditions.push(inArray(cumplimientoAsesores.mes, data.meses));
    if (data.unidades.length > 0) {
      conditions.push(inArray(cumplimientoAsesores.unidadNegocioId, data.unidades));
    }
    return tx
      .select()
      .from(cumplimientoAsesores)
      .where(and(...conditions));
  });
}
