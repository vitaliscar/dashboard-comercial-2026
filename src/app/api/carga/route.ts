import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/actions/auth";
import { loadExcelToPostgres } from "@/db/load-excel";
import { ExcelParser } from "@/lib/excel-parser";
import { parseExcelInWorker } from "@/lib/parse-excel-in-worker";

export const runtime = "nodejs";
/**
 * El Excel fuente solo crece con el tiempo (209MB al momento de fijar este
 * límite) — 350MB deja margen real de crecimiento. El límite de Server
 * Actions queda en 2mb aparte (CN-010), no aplica a esta ruta.
 */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "gerencia") {
    return NextResponse.json(
      { error: "Solo Gerencia Nacional puede cargar datos desde Excel." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido o demasiado grande." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  const maxBytes = 350 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "El archivo supera el límite de 350 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // El parseo (XLSX.read + sheet_to_json, trabajo sincrono pesado) corre en
  // un worker thread aparte — de lo contrario un upload de gerencia congela
  // el event loop de este proceso Next.js para el resto de usuarios
  // conectados mientras dura el parseo (~segundos en archivos de 30-50MB).
  const { sheetNames, sheets } = await parseExcelInWorker(buffer);
  const parser = new ExcelParser(buffer, { sheetNames, sheets });
  const result = await loadExcelToPostgres(parser);
  return NextResponse.json(result);
}
