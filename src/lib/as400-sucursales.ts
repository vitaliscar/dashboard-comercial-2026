/**
 * Resolución de sucursal para filas de "Oportunidades Detallado" (AS400)
 * — compartida entre scripts/load-facturas-as400.ts y los scripts de
 * reconciliación manual (scripts/actualizar-*-agosto.ts). Extraído
 * 2026-09-02 tras encontrarse duplicado literal en 3 archivos (hallazgo de
 * code review): un código de cuenta nuevo agregado en un solo lugar dejaba
 * los demás desincronizados sin ningún error.
 *
 * "Oportunidades Detallado" (a diferencia del embudo) trae Compañia/Sucursal
 * con prefijo de código AS400 ("32-Consorcio de Cogestión Venequip",
 * "46-Machine Shop") — el Excel manual los limpiaba al pegar. Sin quitarlos,
 * normalizarSucursal() no resuelve la sucursal y la comparación exacta contra
 * "Otra Empresa" nunca matchea.
 */
import type { RawRowData } from "@/lib/raw-source-reader";

export const quitarPrefijoCodigo = (v: unknown): string =>
  (v ?? "").toString().trim().replace(/^\d+-/, "");

// Machine Shop se identifica por el CÓDIGO de sucursal AS400 (46), no por el
// texto ya limpio — confirmado con el usuario 2026-09-01. El código es el
// identificador confiable; el nombre podría variar. Solo importa aquí porque
// getFacturasPrincipales() ya no excluye Machine Shop (sí lo siguen
// excluyendo cotizaciones/ventas_perdidas, sin cambios).
const CODIGO_SUCURSAL_MACHINE_SHOP = "46";
export const esMachineShopPorCodigo = (sucursalCruda: unknown): boolean =>
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
// ver warning de sucursalesNoResueltas en load-facturas-as400.ts).
//
// Caso "00116" (YOSELIN MARIA MONSALVE ZABALA) es MIXTO: la misma cuenta
// aparece con sucursal Puerto Ordaz en algunas filas y Caracas en otras — no
// hay ningún campo en el crudo que distinga cuál aplica fila a fila (se
// probó "Asesor Origen", no discrimina). Se deja fijo en Puerto Ordaz
// (mayoría observada) como aproximación; volumen bajo, pendiente de revisar
// si la automatización localiza la lógica real del Apps Script.
export const DICCIONARIO_SUCURSAL_XIBI: Record<string, string> = {
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
export const esDepositoTerritorialPorCodigo = (sucursalCruda: unknown): boolean =>
  (sucursalCruda ?? "")
    .toString()
    .trim()
    .startsWith(`${CODIGO_SUCURSAL_DEPOSITO_TERRITORIAL}-`);

export const DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL: Record<string, string> = {
  "79091": "Caracas", // CORPORACION DIGITEL, C.A.
  "78941": "Valencia", // CHRONUS VENEZUELA, C.A
  "79865": "Valencia", // ROSA FIORELLA VENDRAME FERRERI
};

/**
 * Resuelve Compañia/Sucursal de una fila cruda de "Oportunidades Detallado":
 * quita el prefijo de código AS400 y, para Xibi/Depósito Territorial/Machine
 * Shop (donde el campo "Sucursal" no es una sucursal real), la reemplaza por
 * la sucursal real vía los diccionarios de Cód. Cuenta.
 */
export function resolverSucursalOportunidadesDetallado(row: RawRowData): RawRowData {
  const compania = quitarPrefijoCodigo(row["Compañia"]);
  // Cód. Cuenta trae ceros a la izquierda ("00045") — los diccionarios están
  // keyed sin ellos.
  const codCuenta = parseInt((row["Cód. Cuenta"] ?? "").toString().trim(), 10).toString();
  let sucursal: string;
  if (esMachineShopPorCodigo(row["Sucursal"])) {
    sucursal = "Machine Shop";
  } else if (compania.toLowerCase().includes("xibi") && DICCIONARIO_SUCURSAL_XIBI[codCuenta]) {
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
}
