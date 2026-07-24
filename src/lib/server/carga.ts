import { createServerFn } from "@tanstack/react-start";
import { loadExcelToPostgres } from "@/db/load-excel";
import { requireAuth } from "@/lib/server/auth";

/** Envuelve el mismo loader DELETE+INSERT que corre semanalmente por cron
 * (weekly-excel-load.yml), aceptando un buffer subido desde el navegador en vez
 * de un path local. Solo gerencia puede disparar una carga manual. */
export const uploadExcelFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: FormData) => data)
  .handler(async ({ context, data }) => {
    if (context.role !== "gerencia") {
      throw new Error("Solo Gerencia Nacional puede cargar datos desde Excel.");
    }
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new Error("No se recibió ningún archivo.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return loadExcelToPostgres(buffer);
  });
