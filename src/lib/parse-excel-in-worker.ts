import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { RawRowData } from "@/lib/excel-parser";

/**
 * Corre XLSX.read()/sheet_to_json() en un proceso hijo aparte (no
 * worker_threads — ver excel-parse.worker.ts para el porque), para que un
 * upload manual de Excel (350MB+) no bloquee el event loop del proceso
 * Next.js que sirve al resto de los usuarios conectados.
 *
 * El script se precompila con `bun run build:worker` (ver package.json —
 * corre antes de `next build`/`next dev`) a
 * worker-dist/excel-parse.worker.js.
 */
const WORKER_SCRIPT = path.join(process.cwd(), "worker-dist", "excel-parse.worker.js");

export async function parseExcelInWorker(
  buffer: Buffer,
): Promise<{ sheetNames: string[]; sheets: Record<string, RawRowData[]> }> {
  const tmpId = randomUUID();
  const inputPath = path.join(os.tmpdir(), `excel-carga-${tmpId}.xlsx`);
  const outputPath = path.join(os.tmpdir(), `excel-carga-${tmpId}.json`);

  try {
    await fs.writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        process.execPath,
        [WORKER_SCRIPT, inputPath, outputPath],
        { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
        (error) => {
          // El script siempre escribe outputPath (exito o error) antes de
          // terminar — leemos ese archivo para el detalle real en vez de
          // confiar solo en el exit code / stderr de execFile.
          if (error && error.killed) {
            reject(new Error("Timeout parseando el Excel (proceso no respondió en 120s)."));
          } else {
            resolve();
          }
        },
      );
    });

    const raw = await fs.readFile(outputPath, "utf-8");
    const parsed = JSON.parse(raw) as
      | { sheetNames: string[]; sheets: Record<string, RawRowData[]> }
      | { error: string };
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    return parsed;
  } finally {
    await Promise.all([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
    ]);
  }
}
