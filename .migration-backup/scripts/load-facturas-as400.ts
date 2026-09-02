/**
 * Carga las facturas de CRM (Repuestos/Servicios/Equipos/Alquiler) directo
 * desde los 3 archivos crudos `ReporteEmbudoOppDetallado_*.xlsx` de EspoCRM/BIS
 * (Consorcio + Xibi + Otra Empresa) — sin pasar por Google Sheets ni por el
 * Excel armado a mano.
 *
 * Es un SUBCONJUNTO DE COLUMNAS de "Oportunidades Detallado" (confirmado por
 * la automatización) — no un query aparte. Reusa getFacturasPrincipales() de
 * ExcelParser sin duplicar su lógica (regla de monto por unidad, neteo de
 * lubricante vía getLubMontoPorFactura, etc.) vía el constructor preParsed,
 * combinando los 3 archivos en una sola hoja "Facturacion" sintética.
 *
 * Neteo de lubricante (getLubMontoPorFactura, resta el P.V.P. de
 * LubricantesFiltros del bruto de Repuestos por Nro.Factura(s) para no contar
 * doble): se alimenta con las mismas filas de src/lib/as400-lubricantes.ts
 * que usa load-facturas-lubfiltros-as400.ts.
 *
 * Alcance: SOLO las unidades que produce este reporte (Repuestos, Servicios,
 * Equipos, Alquiler vía CRM) — Lubricantes/Filtros ya lo cubre
 * load-facturas-lubfiltros-as400.ts. Delete scoped a las unidades que
 * realmente aparecen en las filas parseadas.
 *
 * Gap conocido (igual que en los scripts anteriores): no resuelve `asesor_id`
 * (requiere el fuzzy-match de seedUsuarios). `asesor` (texto libre) sí se guarda.
 *
 * Uso: bun scripts/load-facturas-as400.ts
 */
import { inArray } from "drizzle-orm";
import * as os from "node:os";
import * as path from "node:path";
import { dbAdmin } from "@/db";
import { facturas } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser } from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";
import { leerFilasLubricanteVentasrepuesto } from "@/lib/as400-lubricantes";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
// Banner de filtros del reporte ocupa las primeras 11 filas — header real en fila 12.
const HEADER_ROW = 12;
// 3 archivos por corrida: Consorcio (principal), Xibi, Otra Empresa.
const PATRONES_OPORTUNIDADES_DETALLADO = [
  /^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i,
  /^ReporteEmbudoOppDetallado_.*xibi.*\.xlsx$/i,
  /^ReporteEmbudoOppDetallado_.*otra.*\.xlsx$/i,
];

// "Oportunidades Detallado" (a diferencia del embudo) trae Compañia/Sucursal
// con prefijo de código AS400 ("32-Consorcio de Cogestión Venequip",
// "46-Machine Shop") — el Excel manual los limpiaba al pegar. Sin quitarlos,
// normalizarSucursal() no resuelve la sucursal y la comparación exacta contra
// "Otra Empresa" nunca matchea.
const quitarPrefijoCodigo = (v: unknown): string =>
  (v ?? "").toString().trim().replace(/^\d+-/, "");

// Machine Shop se identifica por el CÓDIGO de sucursal AS400 (46), no por el
// texto ya limpio — confirmado con el usuario 2026-09-01. El código es el
// identificador confiable; el nombre podría variar. Solo importa aquí porque
// getFacturasPrincipales() ya no excluye Machine Shop (sí lo siguen
// excluyendo cotizaciones/ventas_perdidas, sin cambios).
const CODIGO_SUCURSAL_MACHINE_SHOP = "46";
const esMachineShopPorCodigo = (sucursalCruda: unknown): boolean =>
  (sucursalCruda ?? "").toString().trim().startsWith(`${CODIGO_SUCURSAL_MACHINE_SHOP}-`);

// Para Xibi, el campo "Sucursal" del crudo NO es una sucursal real (suele
// venir vacío o repetir la compañía, ej. "Xibi B.V.") — la sucursal real sale
// de un diccionario cliente→sucursal por "Cód. Cuenta", tal como lo resuelve
// formatearNombresOportunidadesDetallado() en el Sheet.
//
// Fusión de dos fuentes: (a) la tabla que el usuario pasó primero (34
// cuentas), y (b) la verificación fila-por-fila de la automatización contra
// el Sheet real (2026-09-01, snapshot 1-sep, 22 cuentas). (b) NO contradijo
// ninguna entrada de (a) — solo confirmó una muestra más chica de su propio
// archivo puntual ("no es exhaustiva"). Reemplazar (a) por (b) habría
// descartado entradas válidas sin motivo — error corregido 2026-09-02.
// Sigue parcial: la descarga completa del año trae más cuentas nuevas —
// ampliar cuando aparezcan (quedan registradas en "Xibi B.V." sin resolver,
// ver warning de sucursalesNoResueltas).
//
// Caso "00116" (YOSELIN MARIA MONSALVE ZABALA) es MIXTO: la misma cuenta
// aparece con sucursal Puerto Ordaz en algunas filas y Caracas en otras — no
// hay ningún campo en el crudo que distinga cuál aplica fila a fila (se
// probó "Asesor Origen", no discrimina). Se deja fijo en Puerto Ordaz
// (mayoría observada) como aproximación; volumen bajo, pendiente de revisar
// si la automatización localiza la lógica real del Apps Script.
const DICCIONARIO_SUCURSAL_XIBI: Record<string, string> = {
  "35": "Puerto Ordaz",
  "37": "Puerto Ordaz",
  "38": "Barquisimeto",
  "44": "Maracaibo",
  "45": "Fmo Piar",
  "46": "Puerto Ordaz",
  "51": "Barquisimeto",
  "53": "Puerto Ordaz",
  "54": "Puerto Ordaz",
  "58": "Caracas",
  "59": "Valencia",
  "60": "Valencia",
  "78": "Caracas",
  "79": "Punto Fijo",
  "81": "Barquisimeto",
  "82": "Puerto La Cruz",
  "90": "Barquisimeto",
  "92": "Puerto Ordaz",
  "114": "Caracas",
  "116": "Puerto Ordaz", // MIXTA: Puerto Ordaz|Caracas, ver nota arriba
  "127": "Valencia",
  "128": "Barquisimeto",
  "130": "Barquisimeto",
  "132": "Caracas",
  "137": "Puerto Ordaz",
  "139": "Maracaibo",
  "140": "Puerto Ordaz",
  "153": "Puerto Ordaz",
  "154": "Valencia",
  "156": "Puerto Ordaz",
  "171": "Puerto Ordaz",
  "173": "Barquisimeto",
  "175": "Puerto La Cruz",
  "178": "Puerto Ordaz",
  "176": "Caracas",
  "181": "Valencia",
  "97": "Puerto Ordaz",
  "105": "Puerto Ordaz",
  "115": "Puerto Ordaz",
  "122": "Puerto Ordaz",
  "123": "Puerto Ordaz",
  "124": "Puerto Ordaz",
  "125": "Puerto Ordaz",
  "107": "Barquisimeto",
  "96": "Valencia",
  "118": "Valencia",
  "109": "Valencia",
  "95": "Maracaibo",
  "113": "Maracaibo",
  "134": "Punto Fijo",
};

// Sucursal código AS400 52 ("Deposito Territorial") tampoco es una sucursal
// comercial real — mismo patrón que Xibi: la sucursal verdadera sale de un
// diccionario por Cód. Cuenta. Confirmado con el usuario 2026-09-02.
const CODIGO_SUCURSAL_DEPOSITO_TERRITORIAL = "52";
const esDepositoTerritorialPorCodigo = (sucursalCruda: unknown): boolean =>
  (sucursalCruda ?? "")
    .toString()
    .trim()
    .startsWith(`${CODIGO_SUCURSAL_DEPOSITO_TERRITORIAL}-`);
const DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL: Record<string, string> = {
  "79091": "Caracas", // CORPORACION DIGITEL, C.A.
  "78941": "Valencia", // CHRONUS VENEZUELA, C.A
  "79865": "Valencia", // ROSA FIORELLA VENDRAME FERRERI
};

async function main() {
  const filas = PATRONES_OPORTUNIDADES_DETALLADO.flatMap((patron) => {
    try {
      const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, patron);
      console.log(`→ Leyendo ${archivo}`);
      return leerArchivoCrudo(archivo, HEADER_ROW).map((row) => {
        const compania = quitarPrefijoCodigo(row["Compañia"]);
        // Cód. Cuenta trae ceros a la izquierda ("00045") — el diccionario está
        // keyed sin ellos.
        const codCuenta = parseInt((row["Cód. Cuenta"] ?? "").toString().trim(), 10).toString();
        let sucursal: string;
        if (esMachineShopPorCodigo(row["Sucursal"])) {
          sucursal = "Machine Shop";
        } else if (
          compania.toLowerCase().includes("xibi") &&
          DICCIONARIO_SUCURSAL_XIBI[codCuenta]
        ) {
          sucursal = DICCIONARIO_SUCURSAL_XIBI[codCuenta];
        } else if (
          esDepositoTerritorialPorCodigo(row["Sucursal"]) &&
          DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL[codCuenta]
        ) {
          sucursal = DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL[codCuenta];
        } else {
          sucursal = quitarPrefijoCodigo(row["Sucursal"]);
        }
        return { ...row, Compañia: compania, Sucursal: sucursal };
      });
    } catch (error) {
      console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
      return [];
    }
  });
  console.log(`→ ${filas.length} filas crudas combinadas (Oportunidades Detallado, 3 compañías)`);

  const filasLubFiltros = leerFilasLubricanteVentasrepuesto(DOWNLOADS_DIR);
  console.log(`→ ${filasLubFiltros.length} filas de LubricantesFiltros (para neteo)`);

  const parser = new ExcelParser("", {
    sheetNames: ["Facturacion", "LubricantesFiltros"],
    sheets: { Facturacion: filas, LubricantesFiltros: filasLubFiltros },
  });

  const facturasRaw = parser.getFacturasPrincipales();
  console.log(`→ ${facturasRaw.length} facturas parseadas`);

  let fechasFallbackCount = 0;
  const sucursalesNoResueltas = new Map<string, number>();
  const unidadesNoResueltas = new Map<string, number>();

  await dbAdmin.transaction(async (tx: DbAdminTx) => {
    const { sucursales: sucursalesMap, unidades: unidadesMap } = await seedCatalogos(tx);
    const today = new Date().toISOString().slice(0, 10);

    const buscarSucursalId = (texto: string): string | null => {
      const id = sucursalesMap.get(texto.trim().toLowerCase()) ?? null;
      if (!id)
        sucursalesNoResueltas.set(texto.trim(), (sucursalesNoResueltas.get(texto.trim()) ?? 0) + 1);
      return id;
    };
    const buscarUnidadId = (texto: string | null): string | null => {
      if (!texto) return null;
      const id = unidadesMap.get(texto.trim().toLowerCase()) ?? null;
      if (!id)
        unidadesNoResueltas.set(texto.trim(), (unidadesNoResueltas.get(texto.trim()) ?? 0) + 1);
      return id;
    };

    const idsUnidades = Array.from(
      new Set(
        facturasRaw.map((f) => buscarUnidadId(f.unidadNegocio)).filter((id): id is string => !!id),
      ),
    );
    if (idsUnidades.length > 0) {
      await tx.delete(facturas).where(inArray(facturas.unidadNegocioId, idsUnidades));
    }

    const insertadas = await insertChunked(
      tx,
      facturas,
      facturasRaw.map((f) => {
        if (!f.fecha) fechasFallbackCount++;
        return {
          fecha: f.fecha ?? today,
          numero: f.numero || null,
          cliente: f.cliente,
          asesor: f.asesor || null,
          asesorId: null,
          monto: String(f.monto),
          sucursalId: buscarSucursalId(f.sucursal),
          unidadNegocioId: buscarUnidadId(f.unidadNegocio),
        };
      }),
    );
    console.log(`✅ ${insertadas} facturas insertadas`);
  });

  if (fechasFallbackCount > 0) {
    console.warn(
      `⚠️  ${fechasFallbackCount} filas sin fecha — se usó la fecha de hoy como fallback.`,
    );
  }
  if (sucursalesNoResueltas.size > 0) {
    console.warn("⚠️  Sucursales no encontradas:");
    sucursalesNoResueltas.forEach((n, s) => console.warn(`   - "${s}" (${n} filas)`));
  }
  if (unidadesNoResueltas.size > 0) {
    console.warn("⚠️  Unidades de negocio no encontradas:");
    unidadesNoResueltas.forEach((n, u) => console.warn(`   - "${u}" (${n} filas)`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
