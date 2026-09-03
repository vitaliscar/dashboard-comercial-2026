/**
 * Rellena presupuestos.ventas_ccv/ventas_xibi/ventas_estrategicas de agosto
 * 2026 con los montos reconciliados hoy contra el cuadro real "Cumplimiento
 * Presupuesto 2026" (ver reconciliación de esta sesión). Ni el Excel legado
 * ("CCV Rendimiento.xlsx") ni ningún loader AS400 habían llenado nunca esta
 * columna para agosto -- venía en $0 en todas las fuentes.
 *
 * Mapeo compañía → columna: Consorcio(CCV)→ventas_ccv, Xibi→ventas_xibi,
 * Otra Empresa→ventas_estrategicas (confirmado: coincide exacto con la hoja
 * "CumplimientoBase" del Excel legado, que trae las mismas 3 columnas por
 * Sucursal+U/N+Mes).
 *
 * Uso: bun scripts/actualizar-presupuestos-ventas-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { presupuestos, sucursales, unidadesNegocio } from "@/db/schema";
import {
  ExcelParser,
  UNIDAD_REPUESTOS,
  UNIDAD_SERVICIOS,
  UNIDAD_EQUIPOS,
  UNIDAD_ALQUILER,
  type RawRowData,
} from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 12;
const ANIO = 2026;
const MES = 8;

const quitarPrefijoCodigo = (v: unknown): string => (v ?? "").toString().trim().replace(/^\d+-/, "");
const esMachineShopPorCodigo = (v: unknown): boolean => (v ?? "").toString().trim().startsWith("46-");
const esDepositoTerritorialPorCodigo = (v: unknown): boolean =>
  (v ?? "").toString().trim().startsWith("52-");

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

type Totales = { [claveSucursalUnidad: string]: number };

function sumarPorSucursalUnidad(rows: RawRowData[], unidades: Set<string>): Totales {
  const parser = new ExcelParser("", { sheetNames: ["Facturacion"], sheets: { Facturacion: rows } });
  const facturas = parser.getFacturasPrincipales();
  const totales: Totales = {};
  facturas.forEach((f) => {
    if (!f.unidadNegocio || !unidades.has(f.unidadNegocio)) return;
    if (!(f.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`)) return;
    const clave = `${f.sucursal}|${f.unidadNegocio}`;
    totales[clave] = (totales[clave] || 0) + f.monto;
  });
  return totales;
}

async function main() {
  const UNIDADES = new Set([UNIDAD_REPUESTOS, UNIDAD_SERVICIOS, UNIDAD_EQUIPOS, UNIDAD_ALQUILER]);

  const rowsCcv = leerYResolver(/^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i);
  const rowsXibi = leerYResolver(/^ReporteEmbudoOppDetallado_.*xibi.*\.xlsx$/i);
  const rowsOtra = leerYResolver(/^ReporteEmbudoOppDetallado_.*otra.*\.xlsx$/i);

  const totalesCcv = sumarPorSucursalUnidad(rowsCcv, UNIDADES);
  const totalesXibi = sumarPorSucursalUnidad(rowsXibi, UNIDADES);
  const totalesEstrategicas = sumarPorSucursalUnidad(rowsOtra, UNIDADES);

  // Servicios CCV no sale de Oportunidades Detallado (se excluye ahí para no
  // contar doble contra el BC de Repuestos) -- sale de ventasgeneral, igual
  // que getServiciosNuevo(). Xibi Servicios no tiene archivo fuente (0).
  try {
    const archivoServ = localizarArchivoMasReciente(DOWNLOADS_DIR, /^ventasgeneral-32-SERVICIO-.*\.xls$/i);
    console.log(`→ Leyendo ${archivoServ}`);
    const filasServ = leerArchivoCrudo(archivoServ, 6);
    const parserServ = new ExcelParser("", { sheetNames: ["Servicios"], sheets: { Servicios: filasServ } });
    const servicios = parserServ.getServiciosNuevo();
    servicios.forEach((s) => {
      if (s.categoriaVenta !== "EXTERNO") return;
      if (!(s.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`)) return;
      const clave = `${s.sucursal}|${UNIDAD_SERVICIOS}`;
      totalesCcv[clave] = (totalesCcv[clave] || 0) + s.monto;
    });
  } catch (error) {
    console.warn(`⚠️  No se encontró archivo de Servicios: ${(error as Error).message}`);
  }

  const claves = new Set([
    ...Object.keys(totalesCcv),
    ...Object.keys(totalesXibi),
    ...Object.keys(totalesEstrategicas),
  ]);

  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadMap = new Map(unidadesRows.map((u) => [u.nombre.trim().toLowerCase(), u.id]));

    let actualizadas = 0;
    const noResueltas: string[] = [];
    for (const clave of claves) {
      const [sucursal, unidad] = clave.split("|");
      const sucursalId = sucursalMap.get(sucursal.trim().toLowerCase());
      const unidadId = unidadMap.get(unidad.trim().toLowerCase());
      if (!sucursalId || !unidadId) {
        noResueltas.push(clave);
        continue;
      }
      const ventasCcv = totalesCcv[clave] || 0;
      const ventasXibi = totalesXibi[clave] || 0;
      const ventasEstrategicas = totalesEstrategicas[clave] || 0;
      const resultado = await tx
        .update(presupuestos)
        .set({
          ventasCcv: String(ventasCcv),
          ventasXibi: String(ventasXibi),
          ventasEstrategicas: String(ventasEstrategicas),
        })
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
        console.log(
          `✓ ${sucursal} / ${unidad}: CCV=${ventasCcv.toFixed(2)} Xibi=${ventasXibi.toFixed(2)} Estrategicas=${ventasEstrategicas.toFixed(2)}`,
        );
      } else {
        console.warn(`⚠️  No existe fila presupuestos para ${sucursal} / ${unidad} en ${ANIO}-${MES}`);
      }
    }
    console.log(`\n✅ ${actualizadas} filas de presupuestos actualizadas`);
    if (noResueltas.length > 0) {
      console.warn("⚠️  Claves sucursal/unidad no resueltas contra catálogo:", noResueltas);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
