/**
 * Carga la tabla `servicios` directo desde el archivo crudo que descarga la
 * automatización AS400 (repo "automatizacion cumplimiento", daily-pipeline con
 * --skip-sheets) — sin pasar por Google Sheets ni por el Excel armado a mano.
 *
 * Fuente: ventasgeneral-32-SERVICIO-<AAAA>-<M>-S92ANAP.xls (patrón con fecha
 * variable en el nombre; se toma el más reciente en DOWNLOADS_DIR).
 *
 * "Taller" y "CSA" no vienen en el archivo crudo (34 columnas) — no son datos
 * del AS400, los deriva una regla fija (portada del Apps Script
 * `procesarReporteServicios` que hoy los teclea/calcula en el Google Sheet,
 * ver mensaje del usuario 2026-08-31). Reimplementada en derivarCsaTaller().
 *
 * Machine Shop (Cod.Suc=46) y FMO Piar (Cod.Suc=23): corrección de sucursal
 * por código y clasificación Interno/Externo por "Descripción del Asiento"
 * ya viven en ExcelParser.getServiciosNuevo() (código compartido con el
 * pipeline Excel) — no se duplican aquí.
 *
 * Uso: bun scripts/load-servicios-as400.ts [ruta-archivo-opcional]
 */
import * as os from "node:os";
import * as path from "node:path";
import { dbAdmin } from "@/db";
import { servicios } from "@/db/schema";
import { seedCatalogos, insertChunked, type DbAdminTx } from "@/db/load-excel";
import { ExcelParser, UNIDAD_SERVICIOS } from "@/lib/excel-parser";
import {
  leerArchivoCrudo,
  localizarArchivoMasReciente,
  type RawRowData,
} from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const PATRON_SERVICIOS = /^ventasgeneral-32-SERVICIO-.*\.xls$/i;
// Banner de filtros del reporte ocupa las primeras 5 filas — header real en fila 6.
const HEADER_ROW = 6;

// Códigos de "Cod. Cliente" que marcan un servicio como CSA (contrato de
// servicio) — lista fija tal como la mantiene procesarReporteServicios().
const CODIGOS_CSA = new Set([
  "78905",
  "27106",
  "25307",
  "79507",
  "79138",
  "27542",
  "27730",
  "40816",
  "55920",
  "56490",
  "58926",
  "66504",
  "70384",
  "75026",
  "78601",
  "33964",
  "73304",
  "92920",
  "1662",
  "5857",
  "37491",
  "41762",
  "42224",
  "49983",
  "49985",
  "60050",
  "62423",
  "78597",
]);

function derivarCsaTaller(row: RawRowData): { csa: string; taller: string } {
  const codCliente = (row["Cod. Cliente"] ?? "").toString().trim();
  const csa = CODIGOS_CSA.has(codCliente) ? "CSA" : "X";

  // Cod.Suc es la fuente confiable para Machine Shop (ver nota en
  // getServiciosNuevo()) — evita depender del prefijo de Responsabilidad
  // sobre el nombre de sucursal sin corregir ("Barquisimeto").
  if ((row["Cod.Suc"] ?? "").toString().trim() === "46") {
    return { csa, taller: "Machine Shop" };
  }

  const sede = (row["Nombre Sucursal"] ?? "").toString().trim().toUpperCase();
  const anio = parseInt(String(row["Año Contable"] ?? ""), 10) || 0;
  const mes = parseInt(String(row["Mes Contable"] ?? ""), 10) || 0;
  const nroResp = (row["Responsabilidad"] ?? "").toString().trim();

  let taller = "X";
  if (sede === "PUERTO ORDAZ" && nroResp.startsWith("825")) {
    taller = "CRM";
  } else if (sede === "MARACAIBO") {
    if (anio < 2025 || (anio === 2025 && mes < 8)) {
      if (nroResp.startsWith("826")) taller = "CNRC";
    } else if (nroResp.endsWith("26")) {
      taller = "CNRC";
    }
  }
  return { csa, taller };
}

async function main() {
  const archivo = process.argv[2] ?? localizarArchivoMasReciente(DOWNLOADS_DIR, PATRON_SERVICIOS);
  console.log(`→ Leyendo ${archivo}`);

  const filas = leerArchivoCrudo(archivo, HEADER_ROW);
  console.log(`→ ${filas.length} filas crudas`);

  // preParsed inyecta las filas ya leídas en el cache interno del parser —
  // evita duplicar la lógica de fecha/normalización/sucursal de
  // getServiciosNuevo(). Ya no excluye ninguna fila (Machine Shop incluida),
  // así que serviciosRaw queda alineado 1:1 con filas por índice.
  const parser = new ExcelParser("", { sheetNames: ["Servicios"], sheets: { Servicios: filas } });
  const serviciosRaw = parser.getServiciosNuevo();
  console.log(`→ ${serviciosRaw.length} filas parseadas`);

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

    await tx.delete(servicios);
    const insertadas = await insertChunked(
      tx,
      servicios,
      serviciosRaw.map((s, i) => {
        if (!s.fecha) fechasFallbackCount++;
        const { csa, taller } = derivarCsaTaller(filas[i]);
        return {
          fecha: s.fecha ?? today,
          cliente: s.cliente,
          monto: String(s.monto),
          tipoServicio: s.tipoServicio || null,
          categoriaVenta: s.categoriaVenta || null,
          compania: s.compania || null,
          asesor: null,
          taller,
          csa,
          sucursalId: buscarSucursalId(s.sucursal),
          unidadNegocioId: buscarUnidadId(UNIDAD_SERVICIOS),
        };
      }),
    );
    console.log(`✅ ${insertadas} filas insertadas en servicios`);
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
