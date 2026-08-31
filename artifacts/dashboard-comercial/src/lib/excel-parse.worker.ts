/**
 * Script standalone (CLI, NO worker_threads): hace el trabajo
 * sincrono/CPU-bound de leer el .xlsx (XLSX.read + sheet_to_json por cada
 * hoja) en un proceso Node/Bun separado, para que un upload manual desde
 * /carga no congele el proceso Next.js para el resto de los usuarios
 * conectados mientras dura el parseo.
 *
 * No usa node:worker_threads a proposito: Turbopack intercepta CUALQUIER
 * uso del Worker de node:worker_threads dentro del bundle de servidor de
 * Next.js (sin importar el alias, el patron de import, ni los argumentos) y
 * lo sustituye por su propio resolver de assets, incompatible con la firma
 * real de esa API. Un proceso hijo aparte (child_process, ver
 * src/lib/parse-excel-in-worker.ts) da el mismo aislamiento sin ese
 * problema.
 *
 * Uso: bun excel-parse.worker.js <ruta-xlsx-entrada> <ruta-json-salida>
 * Escribe { sheetNames, sheets } (o { error }) como JSON en la ruta de
 * salida y termina con exit code 0 (exito) o 1 (error).
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import type { RawRowData } from "@/lib/excel-parser";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Uso: excel-parse.worker.js <entrada.xlsx> <salida.json>");
  process.exit(1);
}

try {
  const buffer = fs.readFileSync(inputPath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: Record<string, RawRowData[]> = {};
  for (const nombre of workbook.SheetNames) {
    const sheet = workbook.Sheets[nombre];
    sheets[nombre] = sheet ? XLSX.utils.sheet_to_json<RawRowData>(sheet) : [];
  }
  fs.writeFileSync(outputPath, JSON.stringify({ sheetNames: workbook.SheetNames, sheets }));
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fs.writeFileSync(outputPath, JSON.stringify({ error: message }));
  process.exit(1);
}
