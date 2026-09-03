/**
 * Rellena presupuestos.ventas_ccv/ventas_xibi/ventas_estrategicas de
 * Lubricantes/Filtros para agosto 2026 con datos reales, igual que se hizo
 * para Repuestos/Servicios/Equipos/Alquiler.
 *
 * Dos fuentes, igual que getFacturasLubFiltros()/getFacturasPrincipales()
 * en excel-parser.ts:
 * 1. ventasrepuesto (CO/DN/D1/GF/NC) -- P.V.P. Total $ Extendido, por
 *    sucursal, ya excluye la intercompania Xibi->CCV.
 * 2. Ventas estrategicas de lubricante reclasificadas desde Oportunidades
 *    Detallado (esVentaEstrategicaLubricante): opciones tipo "Repuestos"
 *    con "lubricante"/"estrategia" en la descripcion, monto = Ingresos
 *    Esperados Base -- se leen de los 3 archivos por compañia (CCV/Xibi/Otra).
 *
 * Uso: bun scripts/actualizar-presupuestos-lubfiltros-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { presupuestos, sucursales, unidadesNegocio } from "@/db/schema";
import { ExcelParser, UNIDAD_LUBFILTROS, type RawRowData } from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";
import { leerFilasLubricanteVentasrepuesto } from "@/lib/as400-lubricantes";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 12;
const ANIO = 2026;
const MES = 8;

const quitarPrefijoCodigo = (v: unknown): string => (v ?? "").toString().trim().replace(/^\d+-/, "");
const esMachineShopPorCodigo = (v: unknown): boolean => (v ?? "").toString().trim().startsWith("46-");
const esDepositoTerritorialPorCodigo = (v: unknown): boolean => (v ?? "").toString().trim().startsWith("52-");
const DICCIONARIO_SUCURSAL_XIBI: Record<string, string> = {
  "35": "Puerto Ordaz", "37": "Puerto Ordaz", "38": "Barquisimeto", "44": "Maracaibo", "45": "Fmo Piar",
  "46": "Puerto Ordaz", "51": "Barquisimeto", "53": "Puerto Ordaz", "54": "Puerto Ordaz", "58": "Caracas",
  "59": "Valencia", "60": "Valencia", "78": "Caracas", "79": "Punto Fijo", "81": "Barquisimeto",
  "82": "Puerto La Cruz", "90": "Barquisimeto", "92": "Puerto Ordaz", "114": "Caracas", "116": "Puerto Ordaz",
  "127": "Valencia", "128": "Barquisimeto", "130": "Barquisimeto", "132": "Caracas", "137": "Puerto Ordaz",
  "139": "Maracaibo", "140": "Puerto Ordaz", "153": "Puerto Ordaz", "154": "Valencia", "156": "Puerto Ordaz",
  "171": "Puerto Ordaz", "173": "Barquisimeto", "175": "Puerto La Cruz", "178": "Puerto Ordaz",
  "176": "Caracas", "181": "Valencia", "97": "Puerto Ordaz", "105": "Puerto Ordaz", "115": "Puerto Ordaz",
  "122": "Puerto Ordaz", "123": "Puerto Ordaz", "124": "Puerto Ordaz", "125": "Puerto Ordaz",
  "107": "Barquisimeto", "96": "Valencia", "118": "Valencia", "109": "Valencia", "95": "Maracaibo",
  "113": "Maracaibo", "134": "Punto Fijo",
};
const DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL: Record<string, string> = {
  "79091": "Caracas", "78941": "Valencia", "79865": "Valencia",
};

function resolverFilas(rows: RawRowData[]): RawRowData[] {
  return rows.map((row) => {
    const compania = quitarPrefijoCodigo(row["Compañia"]);
    const codCuenta = parseInt((row["Cód. Cuenta"] ?? "").toString().trim(), 10).toString();
    let sucursal: string;
    if (esMachineShopPorCodigo(row["Sucursal"])) sucursal = "Machine Shop";
    else if (compania.toLowerCase().includes("xibi") && DICCIONARIO_SUCURSAL_XIBI[codCuenta])
      sucursal = DICCIONARIO_SUCURSAL_XIBI[codCuenta];
    else if (esDepositoTerritorialPorCodigo(row["Sucursal"]) && DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL[codCuenta])
      sucursal = DICCIONARIO_SUCURSAL_DEPOSITO_TERRITORIAL[codCuenta];
    else sucursal = quitarPrefijoCodigo(row["Sucursal"]);
    return { ...row, Compañia: compania, Sucursal: sucursal };
  });
}

function leerYResolver(patron: RegExp): RawRowData[] {
  try {
    const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, patron);
    console.log(`→ Leyendo ${archivo}`);
    return resolverFilas(leerArchivoCrudo(archivo, HEADER_ROW));
  } catch (error) {
    console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
    return [];
  }
}

type Totales = { [claveSucursal: string]: number };

function sumarReclasificadas(rows: RawRowData[]): Totales {
  const filasLub = leerFilasLubricanteVentasrepuesto(DOWNLOADS_DIR);
  const parser = new ExcelParser("", {
    sheetNames: ["Facturacion", "LubricantesFiltros"],
    sheets: { Facturacion: rows, LubricantesFiltros: filasLub },
  });
  const facturas = parser.getFacturasPrincipales();
  const totales: Totales = {};
  facturas.forEach((f) => {
    if (f.unidadNegocio !== UNIDAD_LUBFILTROS) return;
    if (!(f.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`)) return;
    totales[f.sucursal] = (totales[f.sucursal] || 0) + f.monto;
  });
  return totales;
}

async function main() {
  // 1. Directo de ventasrepuesto (CO/DN/D1/GF/NC), ya excluye intercompania.
  const filasLub = leerFilasLubricanteVentasrepuesto(DOWNLOADS_DIR);
  const directoCcv: Totales = {};
  const directoXibi: Totales = {};
  filasLub.forEach((row) => {
    const mes = parseInt(String(row["Mes"] ?? ""), 10);
    const anio = parseInt(String(row["Año"] ?? ""), 10);
    if (mes !== MES || anio !== ANIO) return;
    const sucursal = (row["Sucursal"] ?? "").toString().trim();
    // Sucursal cruda viene en mayúsculas ("PUERTO ORDAZ", "LOS RUICES") --
    // se normaliza a Title Case simple + Los Ruices->Caracas al insertar.
    const sucursalNormalizada = sucursal
      .toLowerCase()
      .replace(/(^|\s)([a-záéíóúñ])/g, (_m, sp, ch) => sp + ch.toUpperCase());
    const clave = sucursalNormalizada === "Los Ruices" ? "Caracas" : sucursalNormalizada;
    const compania = (row["Compañía"] ?? row["Compañia"] ?? "").toString().trim().toUpperCase();
    const monto = parseFloat(String(row["P.V.P. Total $ Extendido"] ?? "0").replace(/,/g, "")) || 0;
    if (compania.includes("XIBI")) directoXibi[clave] = (directoXibi[clave] || 0) + monto;
    else directoCcv[clave] = (directoCcv[clave] || 0) + monto;
  });

  // 2. Reclasificadas (venta estrategica de lubricante) desde Oportunidades
  // Detallado, por compañia -- CCV/Xibi/Otra(->Estrategicas).
  const rowsCcv = leerYResolver(/^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i);
  const rowsXibi = leerYResolver(/^ReporteEmbudoOppDetallado_.*xibi.*\.xlsx$/i);
  const rowsOtra = leerYResolver(/^ReporteEmbudoOppDetallado_.*otra.*\.xlsx$/i);
  const reclasCcv = sumarReclasificadas(rowsCcv);
  const reclasXibi = sumarReclasificadas(rowsXibi);
  const reclasEstrategicas = sumarReclasificadas(rowsOtra);

  const totalCcv: Totales = { ...directoCcv };
  Object.entries(reclasCcv).forEach(([s, v]) => (totalCcv[s] = (totalCcv[s] || 0) + v));
  const totalXibi: Totales = { ...directoXibi };
  Object.entries(reclasXibi).forEach(([s, v]) => (totalXibi[s] = (totalXibi[s] || 0) + v));
  const totalEstrategicas: Totales = { ...reclasEstrategicas };

  const claves = new Set([...Object.keys(totalCcv), ...Object.keys(totalXibi), ...Object.keys(totalEstrategicas)]);

  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadId = unidadesRows.find((u) => u.nombre.trim().toLowerCase() === "lubricantes/filtros")?.id;
    if (!unidadId) throw new Error('unidad "Lubricantes/Filtros" no existe en catálogo');

    let actualizadas = 0;
    for (const sucursal of claves) {
      const sucursalId = sucursalMap.get(sucursal.trim().toLowerCase());
      if (!sucursalId) {
        console.warn(`⚠️  Sucursal no resuelta: "${sucursal}"`);
        continue;
      }
      const ccv = totalCcv[sucursal] || 0;
      const xibi = totalXibi[sucursal] || 0;
      const est = totalEstrategicas[sucursal] || 0;
      const resultado = await tx
        .update(presupuestos)
        .set({ ventasCcv: String(ccv), ventasXibi: String(xibi), ventasEstrategicas: String(est) })
        .where(
          and(
            eq(presupuestos.anio, ANIO),
            eq(presupuestos.mes, MES),
            eq(presupuestos.sucursalId, sucursalId),
            eq(presupuestos.unidadNegocioId, unidadId),
          ),
        )
        .returning({ id: presupuestos.id });
      if (resultado.length > 0) {
        actualizadas++;
        console.log(`✓ ${sucursal}: CCV=${ccv.toFixed(2)} Xibi=${xibi.toFixed(2)} Estrategicas=${est.toFixed(2)}`);
      } else {
        console.warn(`⚠️  No existe fila presupuestos para Lubricantes/Filtros / ${sucursal} en ${ANIO}-${MES}`);
      }
    }
    console.log(`\n✅ ${actualizadas} filas actualizadas`);
    console.log(`\nTotal CCV: ${Object.values(totalCcv).reduce((a, b) => a + b, 0).toFixed(2)}`);
    console.log(`Total Xibi: ${Object.values(totalXibi).reduce((a, b) => a + b, 0).toFixed(2)}`);
    console.log(`Total Estratégicas: ${Object.values(totalEstrategicas).reduce((a, b) => a + b, 0).toFixed(2)}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
