import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { cumplimientoAsesores } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";

export const getCumplimientoFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((data: { anio: number; meses: number[] | "all"; unidades: string[] }) => data)
  .handler(async ({ context, data }) => {
    const conditions = [eq(cumplimientoAsesores.anio, data.anio)];
    if (data.meses !== "all") {
      conditions.push(inArray(cumplimientoAsesores.mes, data.meses));
    }
    if (data.unidades.length > 0) {
      conditions.push(inArray(cumplimientoAsesores.unidadNegocioId, data.unidades));
    }
    return context.tx
      .select()
      .from(cumplimientoAsesores)
      .where(and(...conditions));
  });
