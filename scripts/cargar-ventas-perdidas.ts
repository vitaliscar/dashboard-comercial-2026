/**
 * Carga `ventas_perdidas` (Repuestos/Lubricantes) desde el crudo AS400
 * "Ventas_Perdidas_*.xlsx" -- línea por línea, sin agrupar por cotización
 * (permite identificar suplidor y separar Repuestos de Lubricantes/Filtros).
 * Servicios/Equipos/Alquiler NO salen de este archivo -- vienen de
 * Oportunidades con etapa "Cerrado sin negocio"/"Cerrado perdido".
 *
 * Filtro: solo filas con "Estatus Documento" = "Venta Perdida". Fecha de la
 * venta perdida = "Fecha VP" (confirmado con el usuario 2026-09-09), monto =
 * "Precio Cotiz$ Unit" × "Cant VP". Mapeo de sucursal (código de la propia
 * app TAU ventasperdidas, DISTINTO del código AS400 de otros reportes) y
 * clasificación Repuestos/Lubricantes (LUB_SUPPLIERS = CO/DN/D1/GF/NC, mismo
 * criterio que usa el pipeline de automatización) también confirmados con
 * el usuario.
 *
 * Uso: bun scripts/cargar-ventas-perdidas.ts <ruta-al-xlsx>
 */
import * as XLSX from "xlsx";
import * as fs from "node:fs";
import { dbAdmin } from "@/db";
import { ventasPerdidas, sucursales, unidadesNegocio } from "@/db/schema";
import { and, gte, lt } from "drizzle-orm";

const HEADER_ROW_MARKER = "Estatus Documento";
const LUB_SUPPLIERS = new Set(["CO", "DN", "D1", "GF", "NC"]);

const SUCURSAL_POR_CODIGO: Record<string, string> = {
  "01": "Puerto Ordaz",
  "02": "Puerto La Cruz",
  "03": "Barquisimeto",
  "04": "Valencia",
  "05": "Caracas",
  "07": "Maracaibo",
  "08": "Punto Fijo",
  "12": "Guasare",
  "13": "Maturín",
  "52": "Gerencia Nacional",
};

function excelFechaToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNumero(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error("Uso: bun scripts/cargar-ventas-perdidas.ts <ruta-al-xlsx>");

  const buf = fs.readFileSync(archivo);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  const headerRowIdx = rows.findIndex((r) => Array.isArray(r) && r.includes(HEADER_ROW_MARKER));
  if (headerRowIdx === -1) throw new Error(`No se encontró la fila de encabezados ("${HEADER_ROW_MARKER}")`);
  const headers = rows[headerRowIdx] as string[];
  const idx = (nombre: string) => {
    const i = headers.indexOf(nombre);
    if (i === -1) throw new Error(`Columna "${nombre}" no encontrada en el encabezado`);
    return i;
  };

  const iSuc = idx("Suc");
  const iAsesorCod = idx("Asesor");
  const iNombreAsesor = idx("Nombre Asesor");
  const iNombreCliente = idx("Nombre Cliente");
  const iSupl = idx("Supl");
  const iPrecioUnit = idx("Precio Cotiz$ Unit");
  const iEstatus = idx("Estatus Documento");
  const iFechaVP = idx("Fecha VP");
  const iCantVP = idx("Cant VP");
  const iNombreRazon = idx("Nombre de Razón");

  const dataRows = rows.slice(headerRowIdx + 1).filter((r) => Array.isArray(r) && r[0] != null);

  const perdidas = dataRows.filter(
    (r) => String(r[iEstatus] ?? "").trim().toUpperCase() === "VENTA PERDIDA",
  );

  console.log(`→ ${dataRows.length} filas totales, ${perdidas.length} con Estatus "Venta Perdida"`);

  const sucRows = await dbAdmin.select().from(sucursales);
  const uniRows = await dbAdmin.select().from(unidadesNegocio);
  const repuestos = uniRows.find((u) => u.nombre === "Repuestos");
  const lubFiltros = uniRows.find((u) => u.nombre === "Lubricantes/Filtros");
  if (!repuestos || !lubFiltros) throw new Error("Unidades Repuestos/Lubricantes-Filtros no existen en catálogo");

  const sinResolverSucursal = new Set<string>();
  const registros = perdidas
    .map((r) => {
      const fecha = excelFechaToISO(r[iFechaVP]);
      if (!fecha) return null;
      const codSuc = String(r[iSuc] ?? "").trim().padStart(2, "0");
      const sucursalNombre = SUCURSAL_POR_CODIGO[codSuc] ?? "No Definido";
      const suc = sucRows.find((s) => s.nombre === sucursalNombre);
      if (!suc) sinResolverSucursal.add(`${codSuc} -> ${sucursalNombre}`);
      const supl = String(r[iSupl] ?? "").trim().toUpperCase();
      const unidad = LUB_SUPPLIERS.has(supl) ? lubFiltros : repuestos;
      const monto = parseNumero(r[iPrecioUnit]) * parseNumero(r[iCantVP]);
      return {
        fecha,
        cliente: String(r[iNombreCliente] ?? "").trim() || "Sin nombre",
        asesor: String(r[iNombreAsesor] ?? "").trim() || null,
        sucursalId: suc?.id ?? null,
        unidadNegocioId: unidad.id,
        monto: String(monto),
        razon: String(r[iNombreRazon] ?? "").trim() || "Sin razón especificada",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (sinResolverSucursal.size > 0) {
    console.warn("⚠️  Códigos de sucursal sin resolver:", [...sinResolverSucursal]);
  }

  const porUnidad = new Map<string, { cantidad: number; monto: number }>();
  for (const r of registros) {
    const nombre = r.unidadNegocioId === repuestos.id ? "Repuestos" : "Lubricantes/Filtros";
    const acc = porUnidad.get(nombre) ?? { cantidad: 0, monto: 0 };
    acc.cantidad++;
    acc.monto += Number(r.monto);
    porUnidad.set(nombre, acc);
  }
  console.log("→ Resumen por unidad:", Object.fromEntries(porUnidad));

  const fechas = registros.map((r) => r.fecha).sort();
  if (fechas.length > 0) {
    const min = fechas[0]!;
    const maxSiguiente = new Date(fechas[fechas.length - 1]! + "T00:00:00Z");
    maxSiguiente.setUTCDate(maxSiguiente.getUTCDate() + 1);
    const maxSiguienteISO = maxSiguiente.toISOString().slice(0, 10);
    console.log(`→ Rango de fechas: ${min} .. ${fechas[fechas.length - 1]}`);

    // Reemplaza el rango completo para evitar duplicados si se corre 2 veces.
    await dbAdmin.transaction(async (tx) => {
      await tx.delete(ventasPerdidas).where(
        and(gte(ventasPerdidas.fecha, min), lt(ventasPerdidas.fecha, maxSiguienteISO)),
      );
      for (const r of registros) {
        await tx.insert(ventasPerdidas).values(r);
      }
    });
  }

  console.log(`✅ ${registros.length} ventas perdidas cargadas`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
