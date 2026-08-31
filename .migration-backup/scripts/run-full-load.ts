import { readFileSync } from "fs";
import { loadExcelToPostgres } from "@/db/load-excel";

const EXCEL_PATH = process.argv[2];
if (!EXCEL_PATH) {
  console.error("Uso: bun scripts/run-full-load.ts <ruta-al-excel>");
  process.exit(1);
}

const buffer = readFileSync(EXCEL_PATH);

loadExcelToPostgres(buffer).then((result) => {
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
});
