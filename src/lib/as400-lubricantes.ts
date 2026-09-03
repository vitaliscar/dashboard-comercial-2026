/**
 * Lectura compartida de las filas de Lubricantes/Filtros dentro del reporte
 * combinado `ventasrepuesto` de AS400 (Tradicionales + Lubricantes en el mismo
 * archivo, separados por Cód. Suplidor). Usada por los loaders de facturas de
 * Lub/Filtros y de Facturacion (para el neteo de doble conteo) — ver
 * scripts/load-facturas-lubfiltros-as400.ts y scripts/load-facturas-as400.ts.
 */
import {
  leerArchivoCrudo,
  localizarArchivosOrdenados,
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

/**
 * Elige, entre los candidatos ordenados por mtime desc, el primero que
 * efectivamente trae filas de anio/mes -- la automatización a veces deja más
 * de un archivo de la misma fuente en una corrida (p.ej. una ventana que
 * arranca en agosto y otra que arranca en septiembre), y el más reciente por
 * mtime no siempre es el que cubre el mes que se está reconciliando.
 */
function elegirArchivoConDatosDelMes(
  candidatos: string[],
  headerRow: number,
  anio: number,
  mes: number,
): { archivo: string; filas: RawRowData[] } | null {
  for (const archivo of candidatos) {
    const filas = leerArchivoCrudo(archivo, headerRow);
    const tieneMes = filas.some(
      (row) => parseInt(String(row["Mes"] ?? ""), 10) === mes && parseInt(String(row["Año"] ?? ""), 10) === anio,
    );
    if (tieneMes) return { archivo, filas };
  }
  return null;
}

/**
 * Filas de ventasrepuesto (ambas particiones) cuyo Cód. Suplidor es de
 * Lubricantes/Filtros.
 *
 * Si se pasan `anio`/`mes`, se usan para elegir -- entre los candidatos que
 * matchean cada patrón -- el más reciente que efectivamente trae filas de ese
 * mes (la automatización puede dejar más de un archivo de la misma fuente en
 * una corrida, con distintas ventanas de fecha, y el más reciente por mtime
 * no siempre es el que cubre el mes buscado). Sin `anio`/`mes` (p.ej. un
 * loader histórico que no reconcilia un solo mes), se toma el más reciente
 * de cada patrón sin filtrar -- comportamiento previo.
 */
export function leerFilasLubricanteVentasrepuesto(
  downloadsDir: string,
  anio?: number,
  mes?: number,
): RawRowData[] {
  const filas: RawRowData[] = [];
  for (const patron of PATRONES_VENTASREPUESTO) {
    try {
      const candidatos = localizarArchivosOrdenados(downloadsDir, patron);
      if (candidatos.length === 0) throw new Error(`No se encontró ningún archivo que matchee ${patron}`);
      if (anio === undefined || mes === undefined) {
        console.log(`→ Leyendo ${candidatos[0]}`);
        filas.push(...leerArchivoCrudo(candidatos[0], HEADER_ROW));
        continue;
      }
      const elegido = elegirArchivoConDatosDelMes(candidatos, HEADER_ROW, anio, mes);
      if (!elegido) {
        console.warn(
          `⚠️  Ninguno de los ${candidatos.length} archivos para ${patron} trae filas de ${anio}-${mes}; usando el más reciente igual: ${candidatos[0]}`,
        );
        filas.push(...leerArchivoCrudo(candidatos[0], HEADER_ROW));
        continue;
      }
      console.log(`→ Leyendo ${elegido.archivo}`);
      filas.push(...elegido.filas);
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
