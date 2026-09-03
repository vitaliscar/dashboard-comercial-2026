/**
 * Rellena cumplimiento_asesores.venta_ccv/venta_xibi/venta_estrategicas con
 * datos reales desde Oportunidades Detallado (3 archivos por compañía),
 * reusando getFacturasPrincipales() -- misma normalización de unidad/sucursal
 * y mismo neteo de lubricante que ya usa el resto de la reconciliación --
 * pero agrupado por Código Asesor + unidad de negocio en vez de por sucursal.
 *
 * Match contra cumplimiento_asesores: (codigo_asesor, unidad_negocio_id,
 * anio, mes). Si un asesor tiene más de una fila para la misma unidad
 * (sucursales distintas en el mismo mes), todas reciben el mismo total --
 * no hay forma de partir el monto por sucursal a este nivel de detalle sin
 * el crudo lo trae ya agregado por asesor, no por asesor+sucursal.
 *
 * Uso: bun scripts/actualizar-cumplimiento-asesores-ccv-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { cumplimientoAsesores, unidadesNegocio } from "@/db/schema";
import { ExcelParser, type RawRowData } from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";
import { resolverSucursalOportunidadesDetallado } from "@/lib/as400-sucursales";

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

type Totales = { [claveAsesorUnidad: string]: number };

function sumarPorAsesorUnidad(rows: RawRowData[]): Totales {
  const parser = new ExcelParser("", { sheetNames: ["Facturacion"], sheets: { Facturacion: rows } });
  const facturas = parser.getFacturasPrincipales();
  const totales: Totales = {};
  facturas.forEach((f) => {
    if (!f.codigoAsesor || !f.unidadNegocio) return;
    if (!(f.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`)) return;
    const clave = `${f.codigoAsesor}|${f.unidadNegocio}`;
    totales[clave] = (totales[clave] || 0) + f.monto;
  });
  return totales;
}

async function main() {
  const rowsCcv = leerYResolver(/^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i);
  const rowsXibi = leerYResolver(/^ReporteEmbudoOppDetallado_.*xibi.*\.xlsx$/i);
  const rowsOtra = leerYResolver(/^ReporteEmbudoOppDetallado_.*otra.*\.xlsx$/i);

  const totalesCcv = sumarPorAsesorUnidad(rowsCcv);
  const totalesXibi = sumarPorAsesorUnidad(rowsXibi);
  const totalesEstrategicas = sumarPorAsesorUnidad(rowsOtra);

  const claves = new Set([
    ...Object.keys(totalesCcv),
    ...Object.keys(totalesXibi),
    ...Object.keys(totalesEstrategicas),
  ]);

  await dbAdmin.transaction(async (tx) => {
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const unidadMap = new Map(unidadesRows.map((u) => [u.nombre.trim().toLowerCase(), u.id]));

    let actualizadas = 0;
    const noResueltas: string[] = [];
    for (const clave of claves) {
      const [codigoAsesor, unidad] = clave.split("|");
      const unidadId = unidadMap.get(unidad.trim().toLowerCase());
      if (!unidadId) {
        noResueltas.push(clave);
        continue;
      }
      const ccv = totalesCcv[clave] || 0;
      const xibi = totalesXibi[clave] || 0;
      const est = totalesEstrategicas[clave] || 0;
      const resultado = await tx
        .update(cumplimientoAsesores)
        .set({ ventaCcv: String(ccv), ventaXibi: String(xibi), ventaEstrategicas: String(est) })
        .where(
          and(
            eq(cumplimientoAsesores.anio, ANIO),
            eq(cumplimientoAsesores.mes, MES),
            eq(cumplimientoAsesores.codigoAsesor, codigoAsesor),
            eq(cumplimientoAsesores.unidadNegocioId, unidadId),
          ),
        )
        .returning({ id: cumplimientoAsesores.id });
      if (resultado.length > 0) {
        actualizadas += resultado.length;
        console.log(
          `✓ ${codigoAsesor} / ${unidad}: CCV=${ccv.toFixed(2)} Xibi=${xibi.toFixed(2)} Estrategicas=${est.toFixed(2)} (${resultado.length} fila${resultado.length > 1 ? "s" : ""})`,
        );
      } else {
        noResueltas.push(clave);
      }
    }
    console.log(`\n✅ ${actualizadas} filas de cumplimiento_asesores actualizadas`);
    if (noResueltas.length > 0) {
      console.warn(
        `⚠️  ${noResueltas.length} claves código-asesor/unidad no resueltas contra cumplimiento_asesores (asesor sin fila para ${ANIO}-${MES}, o unidad no reconocida):`,
        noResueltas.slice(0, 20),
      );
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
