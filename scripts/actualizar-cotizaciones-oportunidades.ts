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
import { ExcelParser, UNIDAD_LUBFILTROS, UNIDAD_REPUESTOS } from "@/lib/excel-parser";
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
  // getCotizacionesPrincipales() intenta netear Repuestos contra la hoja
  // "Oportunidades LubFiltros" internamente -- esa hoja NO se descarga en el
  // pipeline automático (no existe ese reporte por separado), así que la
  // resta interna siempre da 0 y Repuestos queda inflado por el monto real
  // de Lub/Filtros. Confirmado con el usuario 2026-09-04 ("cotizado de
  // lubricantes filtros exagerado" -- en realidad era Repuestos sin netear).
  // Se re-hace la resta acá mismo, contra las cotizaciones de Lub/Filtros que
  // YA quedaron insertadas por actualizar-cotizaciones-lubfiltros-agosto.ts
  // (debe correr ANTES que este script, ver reconciliar-mensual.sh).
  const todas = parser.getCotizacionesPrincipales();
  const delMesSinNetear = todas.filter(
    (c) => c.unidadNegocio !== UNIDAD_LUBFILTROS && (c.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`),
  );

  const lubPorCliente = new Map<string, number>();
  const inicioMesLub = `${ANIO}-${String(MES).padStart(2, "0")}-01`;
  const inicioMesSiguienteLub = MES === 12 ? `${ANIO + 1}-01-01` : `${ANIO}-${String(MES + 1).padStart(2, "0")}-01`;
  const unidadesPrevias = await dbAdmin.select().from(unidadesNegocio);
  const unidadLubFiltrosPrevia = unidadesPrevias.find((u) => u.nombre.trim().toLowerCase() === "lubricantes/filtros");
  if (unidadLubFiltrosPrevia) {
    const lubRows = await dbAdmin
      .select({ cliente: cotizaciones.cliente, monto: cotizaciones.monto })
      .from(cotizaciones)
      .where(
        and(
          eq(cotizaciones.unidadNegocioId, unidadLubFiltrosPrevia.id),
          gte(cotizaciones.fecha, inicioMesLub),
          lt(cotizaciones.fecha, inicioMesSiguienteLub),
        ),
      );
    for (const r of lubRows) lubPorCliente.set(r.cliente, (lubPorCliente.get(r.cliente) ?? 0) + Number(r.monto));
    console.log(`→ ${lubRows.length} cotizaciones de Lub/Filtros ya cargadas, para netear (${lubPorCliente.size} clientes)`);
  }

  const brutoRepuestosPorCliente = new Map<string, number>();
  for (const c of delMesSinNetear) {
    if (c.unidadNegocio !== UNIDAD_REPUESTOS) continue;
    brutoRepuestosPorCliente.set(c.cliente, (brutoRepuestosPorCliente.get(c.cliente) ?? 0) + c.monto);
  }
  const delMes = delMesSinNetear.map((c) => {
    if (c.unidadNegocio !== UNIDAD_REPUESTOS) return c;
    const lub = lubPorCliente.get(c.cliente) ?? 0;
    const bruto = brutoRepuestosPorCliente.get(c.cliente) ?? 0;
    if (lub <= 0 || bruto <= 0) return c;
    return { ...c, monto: c.monto - lub * (c.monto / bruto) };
  });
  console.log(`→ ${delMes.length} cotizaciones de ${ANIO}-${MES} (Repuestos neteado de Lub/Filtros, sin insertar Lub/Filtros aquí)`);

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
