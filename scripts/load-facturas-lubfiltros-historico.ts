/**
 * Backfill historico (2024/2025) de `facturas` para Lubricantes/Filtros,
 * a partir del JSON producido por transform_lubfiltros_historico.py en el
 * servidor (crudo AS400 ventasrepuesto, ya filtrado a suplidores de lubricante
 * y con la normalizacion de Visco Orinoco/FMO Piar aplicada).
 *
 * Variante de scripts/load-facturas-lubfiltros-from-sheet.ts para anios
 * historicos: NO borra todo `facturas` de la unidad (eso pisaria 2026) --
 * borra solo las filas de esa unidad+anio antes de insertar. Sin conciliacion
 * contable (a diferencia de 2026): estos montos son el crudo AS400 tal cual,
 * uso exclusivo como base de tendencia para el motor de presupuesto.
 *
 * Uso: bun scripts/load-facturas-lubfiltros-historico.ts <anio> [ruta-json]
 *   ej: bun scripts/load-facturas-lubfiltros-historico.ts 2024 /tmp/lubfiltros_historico_2024.json
 */
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { facturas } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser, UNIDAD_LUBFILTROS } from "@/lib/excel-parser";

const ANIO = Number(process.argv[2]);
const JSON_PATH = process.argv[3] ?? `/tmp/lubfiltros_historico_${ANIO}.json`;

async function main() {
  if (!Number.isInteger(ANIO) || ANIO < 2000 || ANIO > 2100) {
    throw new Error("Uso: load-facturas-lubfiltros-historico.ts <anio> [ruta-json]");
  }

  console.log(`→ Leyendo ${JSON_PATH}`);
  const { rows } = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as {
    headers: string[];
    rows: Record<string, string>[];
  };
  console.log(`→ ${rows.length} filas crudas (Lub/Filtros, ya filtradas por suplidor)`);

  const parser = new ExcelParser("", {
    sheetNames: ["Lubricantes/Filtros"],
    sheets: { "Lubricantes/Filtros": rows },
  });
  const facturasRaw = parser.getFacturasLubFiltros();
  console.log(`→ ${facturasRaw.length} filas parseadas`);

  const facturasAnio = facturasRaw.filter((f) => f.fecha?.startsWith(`${ANIO}-`));
  if (facturasAnio.length !== facturasRaw.length) {
    console.warn(
      `⚠️  ${facturasRaw.length - facturasAnio.length} filas con fecha fuera de ${ANIO} descartadas`,
    );
  }

  const sucursalesNoResueltas = new Map<string, number>();

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

    await tx
      .delete(facturas)
      .where(
        and(
          eq(facturas.unidadNegocioId, lubFiltrosId),
          sql`extract(year from ${facturas.fecha}) = ${ANIO}`,
        ),
      );

    const sinFecha = facturasAnio.filter((f) => !f.fecha).length;
    if (sinFecha > 0)
      console.warn(
        `⚠️  ${sinFecha} filas sin fecha -- descartadas (no hay fallback seguro para historico)`,
      );

    const insertadas = await insertChunked(
      tx,
      facturas,
      facturasAnio
        .filter((f) => f.fecha)
        .map((f) => ({
          fecha: f.fecha!,
          numero: f.numero || null,
          cliente: f.cliente,
          asesor: f.asesor || null,
          monto: String(f.monto),
          sucursalId: buscarSucursalId(f.sucursal),
          unidadNegocioId: lubFiltrosId,
        })),
    );
    console.log(`✅ ${insertadas} filas de Lubricantes/Filtros ${ANIO} insertadas en facturas`);
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
