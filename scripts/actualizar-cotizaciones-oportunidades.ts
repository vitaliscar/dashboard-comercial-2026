/**
 * Puebla `cotizaciones` (oportunidades en curso, todas las unidades excepto
 * Lub/Filtros que ya se carga aparte) desde el crudo diario
 * ReporteEmbudoOportunidades_*.xlsx (hoja "Embudo de Oportunidades").
 *
 * Gap encontrado 2026-09-04: la app leía /resumen con cards "Cotizado" y
 * "Venta perdida" vacías para septiembre -- reconciliar-mensual.sh solo
 * actualizaba `presupuestos`/`detalles_ventas_*`, nunca `cotizaciones` ni
 * `ventas_perdidas`. El pipeline SÍ descarga este archivo a diario (3x/día
 * desde hoy), simplemente nadie lo insertaba en Postgres desde agosto.
 *
 * `ventas_perdidas` queda pendiente aparte -- el archivo Ventas_Perdidas_*.xlsx
 * que se descarga es un detalle AS400 por línea de repuesto (columnas Cant VP,
 * PV Sugerido, etc.), un formato totalmente distinto al que espera
 * getVentasPerdidasNuevo()/getOportunidadesVentasPerdidasNuevo() -- mapearlo
 * mal metería montos incorrectos, se deja para una sesión con más tiempo.
 *
 * Uso: bun scripts/actualizar-cotizaciones-oportunidades.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { cotizaciones, sucursales, unidadesNegocio } from "@/db/schema";
import { ExcelParser, UNIDAD_LUBFILTROS } from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 12;
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

async function main() {
  const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, /^ReporteEmbudoOportunidades_.*\.xlsx$/i);
  console.log(`→ Leyendo ${archivo}`);
  const filas = leerArchivoCrudo(archivo, HEADER_ROW);
  console.log(`→ ${filas.length} filas crudas`);

  const parser = new ExcelParser("", { sheetNames: ["Oportunidades"], sheets: { Oportunidades: filas } });
  const todas = parser.getCotizacionesPrincipales();
  // Lub/Filtros ya se carga con su propia lógica de neteo -- excluir aquí
  // para no duplicar contra actualizar-cotizaciones-lubfiltros-agosto.ts.
  const delMes = todas.filter(
    (c) => c.unidadNegocio !== UNIDAD_LUBFILTROS && (c.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`),
  );
  console.log(`→ ${delMes.length} cotizaciones de ${ANIO}-${MES} (sin Lub/Filtros)`);

  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadMap = new Map(unidadesRows.map((u) => [u.nombre.trim().toLowerCase(), u.id]));
    const unidadLubFiltros = unidadesRows.find((u) => u.nombre.trim().toLowerCase() === "lubricantes/filtros");
    if (!unidadLubFiltros) throw new Error('unidad "Lubricantes/Filtros" no existe en catálogo');

    // Reemplaza el mes completo (todas las unidades menos Lub/Filtros) --
    // evita duplicar filas si se corre dos veces al día.
    const inicioMes = `${ANIO}-${String(MES).padStart(2, "0")}-01`;
    const inicioMesSiguiente = MES === 12 ? `${ANIO + 1}-01-01` : `${ANIO}-${String(MES + 1).padStart(2, "0")}-01`;
    await tx
      .delete(cotizaciones)
      .where(
        and(
          ne(cotizaciones.unidadNegocioId, unidadLubFiltros.id),
          gte(cotizaciones.fecha, inicioMes),
          lt(cotizaciones.fecha, inicioMesSiguiente),
        ),
      );

    let insertadas = 0;
    const sinResolver = new Set<string>();
    for (const c of delMes) {
      const sucursalId = sucursalMap.get((c.sucursal ?? "").trim().toLowerCase());
      const unidadNegocioId = unidadMap.get((c.unidadNegocio ?? "").trim().toLowerCase());
      if (!sucursalId || !unidadNegocioId) {
        sinResolver.add(`${c.sucursal ?? "?"} / ${c.unidadNegocio ?? "?"}`);
        continue;
      }
      await tx.insert(cotizaciones).values({
        fecha: c.fecha,
        cliente: c.cliente,
        asesor: c.asesor || null,
        asesorCodigo: c.asesorCodigo || null,
        sucursalId,
        unidadNegocioId,
        nroCotizacion: c.nroCotizacion || null,
        monto: String(c.monto ?? 0),
        montoFacturado: String(c.montoFacturado ?? 0),
        montoPerdido: String(c.montoPerdido ?? 0),
        etapa: c.etapa,
        descripcion: c.descripcion || null,
      });
      insertadas++;
    }
    console.log(`\n✅ ${insertadas} cotizaciones insertadas para ${ANIO}-${MES}`);
    if (sinResolver.size > 0) console.warn("⚠️  Sucursal/unidad no resueltas:", [...sinResolver]);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
