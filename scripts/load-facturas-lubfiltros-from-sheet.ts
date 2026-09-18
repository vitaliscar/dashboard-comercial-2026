/**
 * Recarga SOLO las filas de `facturas` con unidad_negocio_id = Lubricantes/Filtros,
 * leyendo la hoja "Lubricantes/Filtros" del Sheet en vivo (Sheets API, volcada a
 * JSON por dump_lubfiltros_json.py) -- mismo parser que la carga completa
 * (ExcelParser.getFacturasLubFiltros(), ver src/db/load-excel.ts) pero sin pasar
 * por el export .xlsx del Sheet completo (rompe por el límite de 10MB de Drive).
 *
 * Root cause del bug: leerHoja("LubricantesFiltros") no calzaba con el nombre
 * real de la hoja ("Lubricantes/Filtros", con espacio y slash) -- devolvía []
 * en silencio, así que esta unidad nunca insertó ninguna fila de facturas.
 * Ya corregido en excel-parser.ts (commit 87ab6a8). Este script hace el backfill
 * único para traer las ~116 filas/mes reales que se venían perdiendo.
 *
 * NO borra toda la tabla `facturas` (esa tiene también Repuestos/Equipos/
 * Alquiler/Servicios de getFacturasPrincipales) -- borra solo las filas de
 * Lub/Filtros antes de insertar las nuevas.
 *
 * asesorId queda null en este backfill (el fuzzy-match completo de asesores
 * vive en loadExcelToPostgres() y no vale la pena replicarlo aquí solo para
 * esto) -- el campo `asesor` de texto sí queda poblado.
 *
 * Uso: bun scripts/load-facturas-lubfiltros-from-sheet.ts [ruta-json-opcional]
 *   (json por defecto: /tmp/lubfiltros_sheet.json)
 */
import { readFileSync } from "node:fs";
import { and, eq, gte } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { facturas } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser, UNIDAD_LUBFILTROS } from "@/lib/excel-parser";

const JSON_PATH = process.argv[2] ?? "/tmp/lubfiltros_sheet.json";

async function main() {
  console.log(`→ Leyendo ${JSON_PATH}`);
  const { rows } = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as {
    headers: string[];
    rows: Record<string, string>[];
  };
  console.log(`→ ${rows.length} filas crudas desde el Sheet`);

  const parser = new ExcelParser("", {
    sheetNames: ["Lubricantes/Filtros"],
    sheets: { "Lubricantes/Filtros": rows },
  });
  const facturasRaw = parser.getFacturasLubFiltros().filter((f) => (f.fecha ?? "9999") >= "2026-01-01");
  console.log(`→ ${facturasRaw.length} filas parseadas`);

  const sucursalesNoResueltas = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);

  await dbAdmin.transaction(async (tx: DbAdminTx) => {
    const { sucursales: sucursalesMap, unidades: unidadesMap } = await seedCatalogos(tx);
    const lubFiltrosId = unidadesMap.get(UNIDAD_LUBFILTROS.trim().toLowerCase());
    if (!lubFiltrosId) throw new Error(`Unidad "${UNIDAD_LUBFILTROS}" no encontrada en catálogo`);

    const buscarSucursalId = (texto: string): string | null => {
      const id = sucursalesMap.get(texto.trim().toLowerCase()) ?? null;
      if (!id)
        sucursalesNoResueltas.set(texto.trim(), (sucursalesNoResueltas.get(texto.trim()) ?? 0) + 1);
      return id;
    };

    await tx.delete(facturas).where(and(eq(facturas.unidadNegocioId, lubFiltrosId), gte(facturas.fecha, "2026-01-01")));
    const insertadas = await insertChunked(
      tx,
      facturas,
      facturasRaw.map((f) => ({
        fecha: f.fecha ?? today,
        numero: f.numero || null,
        cliente: f.cliente,
        asesor: f.asesor || null,
        monto: String(f.monto),
        sucursalId: buscarSucursalId(f.sucursal),
        unidadNegocioId: lubFiltrosId,
      })),
    );
    console.log(`✅ ${insertadas} filas de Lubricantes/Filtros insertadas en facturas`);
  });

  if (sucursalesNoResueltas.size > 0) {
    console.warn("⚠️  Sucursales no encontradas:");
    sucursalesNoResueltas.forEach((n, s) => console.warn(`   - "${s}" (${n} filas)`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
