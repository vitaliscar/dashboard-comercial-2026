/**
 * Lectura compartida de las filas de Lubricantes/Filtros dentro del reporte
 * combinado `ventasrepuesto` de AS400 (Tradicionales + Lubricantes en el mismo
 * archivo, separados por Cód. Suplidor). Usada por los loaders de facturas de
 * Lub/Filtros y de Facturacion (para el neteo de doble conteo) — ver
 * scripts/load-facturas-lubfiltros-as400.ts y scripts/load-facturas-as400.ts.
 */
import {
  leerArchivoCrudo,
  localizarArchivoMasReciente,
  type RawRowData,
} from "@/lib/raw-source-reader";

// Dos archivos por corrida (compañías/particiones AS400 distintas) — se combinan.
const PATRONES_VENTASREPUESTO = [
  /^ventasrepuesto_s92anap32todas_.*\.xls$/i,
  /^ventasrepuesto_g37anap33todas_.*\.xls$/i,
];

// Mismo filtro que usa la automatización en su SQL de origen para separar
// Lubricantes/Filtros de Tradicionales dentro del mismo reporte ventasrepuesto.
const SUPLIDORES_LUBRICANTE = new Set(["CO", "DN", "D1", "GF", "NC"]);
// Banner de filtros del reporte ocupa las primeras 7 filas — header real en fila 8.
const HEADER_ROW = 8;

// Bajo compañía Xibi, "Sucursal" no es una sucursal real ("Xibi B.V", no un
// nombre de sucursal) y "Cód.Suc." viene fijo (no varía por fila). Las filas
// con Cód. Cliente=35 (CONSORCIO DE COGESTION VENEQUIP) son transferencia de
// inventario intercompañía Xibi→Consorcio, no venta a cliente final —
// confirmado con el usuario 2026-09-02: no se cuentan como venta de ninguna
// sucursal. Se excluyen aquí (91 filas / $83K en agosto) para que no se
// pierdan sin explicación ni se atribuyan a una sucursal inventada.
const ES_SUCURSAL_XIBI_NO_REAL = (row: RawRowData): boolean =>
  (row["Sucursal"] ?? "").toString().trim() === "Xibi B.V";
const COD_CLIENTE_INTERCOMPANIA_XIBI = "35";
const esTransferenciaIntercompaniaXibi = (row: RawRowData): boolean =>
  ES_SUCURSAL_XIBI_NO_REAL(row) &&
  (row["Cód. Cliente"] ?? "").toString().trim() === COD_CLIENTE_INTERCOMPANIA_XIBI;

/** Filas de ventasrepuesto (ambas particiones) cuyo Cód. Suplidor es de Lubricantes/Filtros. */
export function leerFilasLubricanteVentasrepuesto(downloadsDir: string): RawRowData[] {
  const filas: RawRowData[] = [];
  for (const patron of PATRONES_VENTASREPUESTO) {
    try {
      const archivo = localizarArchivoMasReciente(downloadsDir, patron);
      console.log(`→ Leyendo ${archivo}`);
      filas.push(...leerArchivoCrudo(archivo, HEADER_ROW));
    } catch (error) {
      console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
    }
  }
  return filas.filter(
    (row) =>
      SUPLIDORES_LUBRICANTE.has((row["Cód. Suplidor"] ?? "").toString().trim().toUpperCase()) &&
      !esTransferenciaIntercompaniaXibi(row),
  );
}
