/**
 * Lector de archivos crudos descargados por la automatización AS400/EspoCRM
 * (repo "automatizacion cumplimiento", pipeline daily-pipeline con --skip-sheets).
 *
 * Reemplaza el paso manual "armar Excel → subir a Sheets → descargar CCV
 * Rendimiento.xlsx" leyendo directo los archivos que la automatización deja en
 * DOWNLOADS_DIR. Contrato acordado con esa automatización (ver mensajes
 * cross-session del 2026-08-31):
 *   - El nombre de archivo lleva fecha variable → localizar por patrón + mtime.
 *   - 4 fuentes son .xlsx con dimensión de hoja corrupta (declaran 1x1).
 *   - 2 fuentes son .xls legacy (BIFF) — soportado nativamente por `xlsx` (SheetJS).
 *   - 3 fuentes tienen un banner de filtros antes del header real (offset de fila).
 *   - Los textos vienen con relleno de espacios de AS400 → cada RawRowData debe
 *     pasar por normalizarTexto()/trim() en el parser que consuma esto.
 *
 * RECONSTRUIDO 2026-09-02: este archivo (untracked, nunca commiteado) se
 * perdió del disco en un cambio de rama externo a esta sesión. Reconstruido
 * de memoria de la conversación — repararDimension() es el código original
 * verbatim (se había leído completo antes de la pérdida); el resto
 * (localizarArchivoMasReciente/leerArchivoCrudo) es una reconstrucción
 * razonada a partir de cómo se usa en as400-lubricantes.ts y los scripts de
 * carga. Verificado 2026-09-02: reproduce exactamente los mismos montos ya
 * validados contra el cuadro real (Repuestos Puerto Ordaz $84.703,52, etc.)
 * — ver reconciliación de esa fecha.
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

// El build ESM de xlsx no asume el `fs` de Node por defecto — sin esto,
// XLSX.readFile falla con "Cannot access file" aunque el archivo exista.
XLSX.set_fs(fs);

export type RawRowData = Record<string, string | number | undefined | null>;

/** Recalcula !ref escaneando las claves de celda reales — corrige el bug de dimensión 1x1. */
function repararDimension(ws: XLSX.WorkSheet): void {
  const claves = Object.keys(ws).filter((k) => k[0] !== "!");
  if (claves.length === 0) return;
  const range = claves.reduce(
    (acc, addr) => {
      const cell = XLSX.utils.decode_cell(addr);
      return {
        s: { r: Math.min(acc.s.r, cell.r), c: Math.min(acc.s.c, cell.c) },
        e: { r: Math.max(acc.e.r, cell.r), c: Math.max(acc.e.c, cell.c) },
      };
    },
    { s: { r: Infinity, c: Infinity }, e: { r: -Infinity, c: -Infinity } },
  );
  ws["!ref"] = XLSX.utils.encode_range(range);
}

/**
 * Busca en `dir` el archivo más reciente (por mtime) cuyo nombre matchea `patron`
 * — el nombre real lo genera la automatización con fecha/hora variable.
 */
export function localizarArchivoMasReciente(dir: string, patron: RegExp): string {
  const archivos = fs.readdirSync(dir).filter((f) => patron.test(f));
  if (archivos.length === 0) {
    throw new Error(`No se encontró ningún archivo que matchee ${patron} en "${dir}"`);
  }
  const masReciente = archivos
    .map((nombre) => ({ nombre, mtime: fs.statSync(path.join(dir, nombre)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  return path.join(dir, masReciente.nombre);
}

/**
 * Lee un archivo crudo (.xls legacy o .xlsx) y devuelve las filas como
 * objetos keyed por el header real, que vive en `headerRow` (1-indexado) —
 * las filas anteriores son el banner de filtros del reporte y se descartan.
 * Repara la dimensión de la hoja primero si viene declarada corrupta (1x1),
 * bug conocido de 4 de las fuentes .xlsx de esta automatización.
 */
export function leerArchivoCrudo(archivo: string, headerRow: number): RawRowData[] {
  const wb = XLSX.readFile(archivo, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  repararDimension(ws);
  return XLSX.utils.sheet_to_json<RawRowData>(ws, {
    range: headerRow - 1,
    defval: null,
  });
}
