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
import { resolverSucursalOportunidadesDetallado } from "@/lib/as400-sucursales";
import { leerFilasLubricanteVentasrepuesto } from "@/lib/as400-lubricantes";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 12;
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

function leerYResolver(patron: RegExp): RawRowData[] {
  try {
    const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, patron);
    console.log(`→ Leyendo ${archivo}`);
    return leerArchivoCrudo(archivo, HEADER_ROW).map(resolverSucursalOportunidadesDetallado);
  } catch (error) {
    console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
    return [];
  }
}

type Totales = { [claveSucursalUnidad: string]: number };

function sumarPorSucursalUnidad(
  rows: RawRowData[],
  unidades: Set<string>,
  filasLubFiltros: RawRowData[] = [],
): Totales {
  const parser = new ExcelParser("", {
    sheetNames: ["Facturacion", "LubricantesFiltros"],
    sheets: { Facturacion: rows, LubricantesFiltros: filasLubFiltros },
  });
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
  // Neteo de Lubricantes/Filtros del bruto de Repuestos-CCV: sin esto,
  // getFacturasPrincipales() cuenta el bruto completo de "Oportunidades
  // Detallado" (que mezcla Repuestos+Lubricante) y Repuestos queda inflado
  // exactamente por el monto de Lub/Filtros de cada sucursal (confirmado
  // 2026-09-03 contra el cuadro real de agosto).
  const filasLubFiltros = leerFilasLubricanteVentasrepuesto(DOWNLOADS_DIR, ANIO, MES);
  console.log(`→ ${filasLubFiltros.length} filas de LubricantesFiltros (para neteo)`);

  const totalesCcv = sumarPorSucursalUnidad(rowsCcv, UNIDADES, filasLubFiltros);
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
