import type { RawRowData } from "@/lib/excel-parser";

/**
 * Corre XLSX.read()/sheet_to_json() en un worker thread aparte, para que un
 * upload manual de Excel (potencialmente 50+ MB) no bloquee el event loop
 * del proceso Next.js que sirve al resto de los usuarios conectados
 * (ver hallazgo de auditoria pre-deploy: src/app/api/carga/route.ts corria
 * esto sincrono en el mismo proceso).
 */
export function parseExcelInWorker(
  buffer: Buffer,
): Promise<{ sheetNames: string[]; sheets: Record<string, RawRowData[]> }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel-parse.worker.ts", import.meta.url).href);

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Timeout parseando el Excel (worker no respondió en 120s)."));
    }, 120_000);

    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      if (event.data?.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data);
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "Error desconocido en el worker de parseo de Excel."));
    };

    // ArrayBuffer transferible: evita copiar el buffer completo al worker.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    worker.postMessage(arrayBuffer, [arrayBuffer]);
  });
}
