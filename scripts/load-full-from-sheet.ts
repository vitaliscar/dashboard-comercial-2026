/**
 * Carga completa (~20 tablas) directo desde el Google Sheet en vivo vía
 * Sheets API, en vez de exportar el spreadsheet a .xlsx por Drive API y
 * subirlo (flujo de api/carga/route.ts).
 *
 * Por qué: el export a .xlsx vía Drive API (`files.export`) tiene un límite
 * duro de Google de 10MB para archivos nativos de Workspace, no configurable.
 * Este spreadsheet (76 tabs, hojas como "SQL Contabilidad" con 81k filas)
 * ya lo supera — confirmado en vivo con `exportSizeLimitExceeded`. Mientras
 * ese export siga roto, la carga manual completa no puede actualizarse y
 * cualquier tabla que dependa de ella queda con snapshots viejos (mismo
 * síntoma que tuvimos con servicios.taller/csa, ver
 * scripts/load-servicios-from-sheet.ts).
 *
 * Fix: leer las 76 hojas directo por Sheets API (sin el límite de export de
 * Drive) y construir el ExcelParser con su constructor `preParsed`
 * ({ sheetNames, sheets }) — el mismo hook que ya usan
 * load-servicios-as400.ts y load-servicios-from-sheet.ts. No cambia nada de
 * ExcelParser.getX() ni de la lógica de las ~20 tablas en db/load-excel.ts.
 *
 * El JSON de entrada lo genera un script Python (dump_all_sheets_json.py,
 * gspread con las credenciales OAuth existentes) — igual patrón que
 * dump_servicios_json.py para el fix de servicios.
 *
 * Uso:
 *   bun scripts/load-full-from-sheet.ts --dry-run [ruta-json]   # solo parsea, ROLLBACK, no persiste
 *   bun scripts/load-full-from-sheet.ts [ruta-json]              # carga real (DELETE+INSERT en ~20 tablas)
 */
import { readFileSync } from "node:fs";
import { loadExcelToPostgres } from "@/db/load-excel";
import { ExcelParser } from "@/lib/excel-parser";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const jsonPath = args.find((a) => !a.startsWith("--")) ?? "/tmp/full_sheet_dump.json";

async function main() {
  console.log(`→ Leyendo ${jsonPath}${dryRun ? " (--dry-run)" : ""}`);
  const { sheetNames, sheets } = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
    sheetNames: string[];
    sheets: Record<string, Record<string, string>[]>;
  };
  console.log(`→ ${sheetNames.length} hojas cargadas desde el Sheet`);

  const parser = new ExcelParser("", { sheetNames, sheets });
  const result = await loadExcelToPostgres(parser, dryRun);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
