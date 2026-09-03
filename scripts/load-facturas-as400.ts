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
import { resolverSucursalOportunidadesDetallado } from "@/lib/as400-sucursales";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
// Banner de filtros del reporte ocupa las primeras 11 filas — header real en fila 12.
const HEADER_ROW = 12;
// 3 archivos por corrida: Consorcio (principal), Xibi, Otra Empresa.
const PATRONES_OPORTUNIDADES_DETALLADO = [
  /^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i,
  /^ReporteEmbudoOppDetallado_.*xibi.*\.xlsx$/i,
  /^ReporteEmbudoOppDetallado_.*otra.*\.xlsx$/i,
];

async function main() {
  const filas = PATRONES_OPORTUNIDADES_DETALLADO.flatMap((patron) => {
    try {
      const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, patron);
      console.log(`→ Leyendo ${archivo}`);
      return leerArchivoCrudo(archivo, HEADER_ROW).map(resolverSucursalOportunidadesDetallado);
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
