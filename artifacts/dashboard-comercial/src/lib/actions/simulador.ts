"use server";

import { and, eq, inArray } from "drizzle-orm";
import { cumplimientoAsesores } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import type { MonthFilter } from "@/lib/date-range";

export async function getSimuladorCumplimientoAction(data: {
  anio: number;
  meses: MonthFilter;
  unidades: string[];
}) {
  return withAuth(({ tx }) => {
    const conditions = [eq(cumplimientoAsesores.anio, data.anio)];
    if (data.meses !== "all" && Array.isArray(data.meses) && data.meses.length > 0) {
      conditions.push(inArray(cumplimientoAsesores.mes, data.meses));
    }
    if (data.unidades && data.unidades.length > 0) {
      conditions.push(inArray(cumplimientoAsesores.unidadNegocioId, data.unidades));
    }
    return tx
      .select()
      .from(cumplimientoAsesores)
      .where(and(...conditions));
  });
}
