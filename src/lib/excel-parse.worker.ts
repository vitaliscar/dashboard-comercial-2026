/**
 * Worker thread: hace el trabajo sincrono/CPU-bound de leer el .xlsx
 * (XLSX.read + sheet_to_json por cada hoja) fuera del event loop principal
 * de Next.js. Un upload manual desde /carga no debe congelar el servidor
 * para el resto de los usuarios conectados mientras dura el parseo.
 *
 * Recibe el buffer del archivo como primer mensaje, responde una sola vez
 * con { sheetNames, sheets } (todas las hojas ya convertidas a JSON) o con
 * { error } si algo falla.
 */
import * as XLSX from "xlsx";
import type { RawRowData } from "@/lib/excel-parser";

declare const self: Worker;

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    const buffer = Buffer.from(event.data);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheets: Record<string, RawRowData[]> = {};
    for (const nombre of workbook.SheetNames) {
      const sheet = workbook.Sheets[nombre];
      sheets[nombre] = sheet ? XLSX.utils.sheet_to_json<RawRowData>(sheet) : [];
    }
    postMessage({ sheetNames: workbook.SheetNames, sheets });
  } catch (error) {
    postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
