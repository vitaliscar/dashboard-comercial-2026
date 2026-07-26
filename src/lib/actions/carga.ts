"use server";

import { loadExcelToPostgres } from "@/db/load-excel";
import { withAuth } from "@/lib/actions/with-auth";

/** Envuelve el mismo loader DELETE+INSERT que corre semanalmente por cron
 * (weekly-excel-load.yml), aceptando un buffer subido desde el navegador en vez
 * de un path local. Solo gerencia puede disparar una carga manual. */
export async function uploadExcelAction(formData: FormData) {
  return withAuth(async ({ role }) => {
    if (role !== "gerencia") {
      throw new Error("Solo Gerencia Nacional puede cargar datos desde Excel.");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("No se recibió ningún archivo.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return loadExcelToPostgres(buffer);
  });
}
