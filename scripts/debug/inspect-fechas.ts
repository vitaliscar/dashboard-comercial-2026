import path from "path";
import fs from "fs";
import { ExcelParser } from "../src/lib/excel-parser";

function usage() {
  console.log("Usage: bun run scripts/inspect-fechas.ts [path/to/CCV_Rendimiento.xlsx]");
  console.log(
    "If no path is provided, script looks for './CCV Rendimiento.xlsx' in the repo root.",
  );
}

const arg = process.argv[2];
const excelPath =
  arg || process.env.EXCEL_FILE || path.resolve(process.cwd(), "CCV Rendimiento.xlsx");

if (!fs.existsSync(excelPath)) {
  console.error(`Excel file not found: ${excelPath}`);
  usage();
  process.exit(2);
}

console.log(`Using Excel file: ${excelPath}`);

try {
  const parser = new ExcelParser(excelPath);

  const hojas = parser.obtenerNombresHojas();

  // Mostrar lista de hojas
  console.log("\nHojas encontradas:", hojas.join(", "));

  // Si existe la hoja 'Oportunidades', mostrar algunas cotizaciones
  if (hojas.includes("Oportunidades")) {
    const cot = parser.getCotizacionesPrincipales();
    console.log(`\nPrimera(s) 10 cotización(es) de 'Oportunidades' (muestra):`);
    console.dir(cot.slice(0, 10), { depth: 2 });
  } else {
    console.log(
      "Hoja 'Oportunidades' no encontrada. Se listan las primeras 5 filas de la primera hoja:",
    );
    const primera = hojas[0];
    if (primera) {
      // acceder al método privado leerHoja no es posible; usar getCotizacionesPrincipales si coincide
      try {
        // intentar métodos conocidos de parser para proporcionar salida útil
        const parserConLeerHoja = parser as unknown as {
          leerHoja?: (hoja: string) => unknown[];
        };
        const cot2 = parserConLeerHoja.leerHoja ? parserConLeerHoja.leerHoja(primera) : [];
        console.dir((cot2 || []).slice(0, 5), { depth: 2 });
      } catch (e) {
        console.error("No fue posible leer filas de la hoja:", e);
      }
    }
  }
} catch (err) {
  console.error("Error al ejecutar el parser:", err);
  process.exit(1);
}
