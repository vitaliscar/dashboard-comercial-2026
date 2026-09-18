/**
 * Backfill historico (2024/2025) de `ventas_perdidas`, a partir del JSON
 * producido por transform_ventas_perdidas_historico.py en el servidor.
 *
 * La hoja "Ventas Perdidas" del Sheet ya no existe -- "Nombre Sucursal" y
 * "Monto Venta Perdidas" (antes columnas calculadas por formula del Sheet)
 * se recalculan en el transform Python: Monto = Cant VP * "Precio Cotiz$
 * Unit" (formula confirmada por el usuario 2026-09-17), Nombre Sucursal via
 * mapeo de codigo AS400 "Suc" (derivado empiricamente de ventasrepuesto,
 * que trae codigo+nombre juntos para la misma compañia).
 *
 * NO borra toda la tabla -- borra solo las filas de ese anio antes de
 * insertar. Sin conciliacion contable, solo base de tendencia.
 *
 * Uso: bun scripts/load-ventas-perdidas-historico.ts <anio> [ruta-json]
 */
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { ventasPerdidas } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser } from "@/lib/excel-parser";

const ANIO = Number(process.argv[2]);
const JSON_PATH = process.argv[3] ?? `/tmp/ventas_perdidas_historico_${ANIO}.json`;

async function main() {
  if (!Number.isInteger(ANIO) || ANIO < 2000 || ANIO > 2100) {
    throw new Error("Uso: load-ventas-perdidas-historico.ts <anio> [ruta-json]");
  }

  console.log(`→ Leyendo ${JSON_PATH}`);
  const { rows } = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as {
    headers: string[];
    rows: Record<string, string>[];
  };
  console.log(`→ ${rows.length} filas crudas (Venta Perdida, ya filtradas)`);

  const parser = new ExcelParser("", {
    sheetNames: ["Ventas Perdidas"],
    sheets: { "Ventas Perdidas": rows },
  });
  const vpRaw = parser.getVentasPerdidasNuevo();
  console.log(`→ ${vpRaw.length} filas parseadas`);

  const vpAnio = vpRaw.filter((v) => v.fecha?.startsWith(`${ANIO}-`));
  if (vpAnio.length !== vpRaw.length) {
    console.warn(
      `⚠️  ${vpRaw.length - vpAnio.length} filas con fecha fuera de ${ANIO} descartadas`,
    );
  }

  const sucursalesNoResueltas = new Map<string, number>();
  const unidadesNoResueltas = new Map<string, number>();

  await dbAdmin.transaction(async (tx: DbAdminTx) => {
    const { sucursales: sucursalesMap, unidades: unidadesMap } = await seedCatalogos(tx);

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

    await tx
      .delete(ventasPerdidas)
      .where(sql`extract(year from ${ventasPerdidas.fecha}) = ${ANIO}`);

    const insertadas = await insertChunked(
      tx,
      ventasPerdidas,
      vpAnio
        .filter((v) => v.fecha)
        .map((v) => ({
          fecha: v.fecha!,
          cliente: v.cliente,
          asesor: v.asesor || null,
          monto: String(v.monto),
          razon: v.razon,
          sucursalId: buscarSucursalId(v.sucursal),
          unidadNegocioId: buscarUnidadId(v.unidadNegocio),
        })),
    );
    console.log(`✅ ${insertadas} filas de ventas_perdidas ${ANIO} insertadas`);
  });

  if (sucursalesNoResueltas.size > 0) {
    console.warn("⚠️  Sucursales no encontradas:");
    sucursalesNoResueltas.forEach((n, s) => console.warn(`   - "${s}" (${n} filas)`));
  }
  if (unidadesNoResueltas.size > 0) {
    console.warn("⚠️  Unidades no encontradas:");
    unidadesNoResueltas.forEach((n, u) => console.warn(`   - "${u}" (${n} filas)`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
