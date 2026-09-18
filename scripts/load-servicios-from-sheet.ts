/**
 * Recarga la tabla `servicios` directo desde la hoja "Servicios" del Google
 * Sheet en vivo (vía Sheets API, volcada a JSON por un script Python con las
 * credenciales OAuth existentes) — mismo parser que usa la carga completa
 * (`ExcelParser.getServiciosNuevo()`, ver src/db/load-excel.ts) pero sin
 * pasar por el flujo de subir el workbook entero (que además falla: el
 * export de Drive a xlsx del spreadsheet completo excede el límite de
 * tamaño de Google).
 *
 * Root cause de taller/csa vacíos en jun-jul 2026 y filas ago-sep 2026
 * faltantes: la tabla `servicios` solo se repuebla vía el "Carga" manual
 * (api/carga → loadExcelToPostgres, un snapshot .xlsx completo del Sheet).
 * Ese snapshot se subió antes de que el Apps Script `procesarReporteServicios`
 * terminara de calcular Taller/CSA para may(parcial)/jun/jul, y antes de que
 * existieran filas de ago/sep — confirmado leyendo la hoja "Servicios" en
 * vivo: Taller/CSA están 100% llenos en el Sheet para todos los meses
 * ene-sep 2026. No es un bug de código en el parser; es un snapshot viejo.
 * NO usar scripts/load-servicios-as400.ts para este backfill: ese script
 * no lee Taller/CSA del Sheet, los re-deriva con una lista fija de códigos
 * CSA y reglas de sede que pueden no estar actualizadas.
 *
 * Uso: bun scripts/load-servicios-from-sheet.ts [ruta-json-opcional]
 *   (json por defecto: /tmp/servicios_sheet.json, generado por
 *    dump_servicios_json.py en el servidor)
 */
import { readFileSync } from "node:fs";
import { dbAdmin } from "@/db";
import { servicios } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser, UNIDAD_SERVICIOS } from "@/lib/excel-parser";

const JSON_PATH = process.argv[2] ?? "/tmp/servicios_sheet.json";

async function main() {
  console.log(`→ Leyendo ${JSON_PATH}`);
  const { rows } = JSON.parse(readFileSync(JSON_PATH, "utf-8")) as {
    headers: string[];
    rows: Record<string, string>[];
  };
  console.log(`→ ${rows.length} filas crudas desde el Sheet`);

  const parser = new ExcelParser("", { sheetNames: ["Servicios"], sheets: { Servicios: rows } });
  const serviciosRaw = parser.getServiciosNuevo();
  console.log(`→ ${serviciosRaw.length} filas parseadas`);

  let fechasFallbackCount = 0;
  const sucursalesNoResueltas = new Map<string, number>();
  const unidadesNoResueltas = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);

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

    await tx.delete(servicios);
    const insertadas = await insertChunked(
      tx,
      servicios,
      serviciosRaw.map((s) => {
        if (!s.fecha) fechasFallbackCount++;
        return {
          fecha: s.fecha ?? today,
          cliente: s.cliente,
          monto: String(s.monto),
          tipoServicio: s.tipoServicio || null,
          categoriaVenta: s.categoriaVenta || null,
          compania: s.compania || null,
          asesor: s.asesor || null,
          taller: s.taller || null,
          csa: s.csa || null,
          sucursalId: buscarSucursalId(s.sucursal),
          unidadNegocioId: buscarUnidadId(UNIDAD_SERVICIOS),
        };
      }),
    );
    console.log(`✅ ${insertadas} filas insertadas en servicios`);
  });

  if (fechasFallbackCount > 0) {
    console.warn(`⚠️  ${fechasFallbackCount} filas sin fecha — se usó la fecha de hoy como fallback.`);
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
