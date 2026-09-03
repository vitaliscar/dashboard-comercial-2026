/**
 * Puebla `cotizaciones` para Lubricantes/Filtros desde el crudo
 * `repuestos_cotizados_*.xlsx` (línea por Nro. Parte, todos los proveedores
 * mezclados) -- se filtra por Cód. Suplidor lubricante (mismo set que
 * src/lib/as400-lubricantes.ts) y se agrupa por Nro. Cotización, sumando
 * Precio $ × Cantidad Cotizada.
 *
 * La columna "Sucursal" de este reporte trae solo el código AS400 (ej. "01"),
 * no el nombre -- se resuelve contra CODIGO_SUCURSAL (extraído cruzando con
 * "Cód.Suc." de ventasrepuesto, que sí trae ambos).
 *
 * Uso: bun scripts/actualizar-cotizaciones-lubfiltros-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq, gte, lt } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { cotizaciones, sucursales, unidadesNegocio } from "@/db/schema";
import { leerArchivoCrudo, localizarArchivoMasReciente } from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 7;
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

const SUPLIDORES_LUBRICANTE = new Set(["CO", "DN", "D1", "GF", "NC"]);

// Extraído cruzando "Cód.Suc." x "Sucursal" en ventasrepuesto (2026-09-03) --
// mismo AS400 que repuestos_cotizados, códigos consistentes entre reportes.
// "05" (Los Ruices) y "46" (Machine Shop) se resuelven igual que en el resto
// de la reconciliación: Los Ruices -> Caracas (confirmado con el usuario),
// Machine Shop es su propia sucursal canónica.
const CODIGO_SUCURSAL: Record<string, string> = {
  "01": "Puerto Ordaz",
  "02": "Puerto La Cruz",
  "03": "Barquisimeto",
  "04": "Valencia",
  "05": "Caracas",
  "07": "Maracaibo",
  "08": "Punto Fijo",
  "13": "Maturín",
  "46": "Machine Shop",
};

const ETAPA_POR_ESTATUS: Record<string, "desarrollo" | "propuesta_negociacion" | "venta_perdida" | "desconocido"> = {
  "re-impresa": "desarrollo",
  impresa: "desarrollo",
  activa: "desarrollo",
  "convertida en orden": "propuesta_negociacion",
  "venta perdida": "venta_perdida",
  cerrada: "venta_perdida",
  expirada: "desconocido",
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isNaN(n) ? 0 : n;
}

function parseFechaDDMMYYYY(v: unknown): { fecha: string; anio: number; mes: number } | null {
  const texto = (v ?? "").toString().trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!match) return null;
  const [, dia, mes, anio] = match;
  return { fecha: `${anio}-${mes}-${dia}`, anio: Number(anio), mes: Number(mes) };
}

type GrupoCotizacion = {
  nroCotizacion: string;
  fecha: string;
  cliente: string;
  sucursalCodigo: string;
  asesorCodigo: string;
  asesorNombre: string;
  estatus: string;
  monto: number;
};

async function main() {
  const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, /^repuestos_cotizados_.*\.xlsx$/i);
  console.log(`→ Leyendo ${archivo}`);
  const filas = leerArchivoCrudo(archivo, HEADER_ROW);
  console.log(`→ ${filas.length} líneas crudas (todos los proveedores)`);

  const grupos = new Map<string, GrupoCotizacion>();
  for (const row of filas) {
    const suplidor = (row["Suplidor"] ?? "").toString().trim().toUpperCase();
    if (!SUPLIDORES_LUBRICANTE.has(suplidor)) continue;

    const periodo = parseFechaDDMMYYYY(row["Fecha Cotización"]);
    if (!periodo || periodo.anio !== ANIO || periodo.mes !== MES) continue;

    const nroCotizacion = (row["Nro. Cotización"] ?? "").toString().trim();
    if (!nroCotizacion) continue;

    const monto = num(row["Precio $"]) * num(row["Cantidad Cotizada"]);

    const existente = grupos.get(nroCotizacion);
    if (existente) {
      existente.monto += monto;
      continue;
    }
    grupos.set(nroCotizacion, {
      nroCotizacion,
      fecha: periodo.fecha,
      cliente: (row["Nombre del Cliente"] ?? "").toString().trim() || "Cliente S/N",
      sucursalCodigo: (row["Sucursal"] ?? "").toString().trim(),
      asesorCodigo: (row["Código Vendedor Cot."] ?? "").toString().trim(),
      asesorNombre: (row["Nombre Vendedor Cot."] ?? "").toString().trim(),
      estatus: (row["Estatus Cotización"] ?? "").toString().trim().toLowerCase(),
      monto,
    });
  }
  console.log(`→ ${grupos.size} cotizaciones únicas de Lub/Filtros en ${ANIO}-${MES}`);

  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadLubFiltros = (await tx.select().from(unidadesNegocio)).find(
      (u) => u.nombre.trim().toLowerCase() === "lubricantes/filtros",
    );
    if (!unidadLubFiltros) throw new Error('unidad "Lubricantes/Filtros" no existe en catálogo');

    // Reemplaza el mes completo -- evita duplicar filas si se corre dos veces.
    const inicioMes = `${ANIO}-${String(MES).padStart(2, "0")}-01`;
    const inicioMesSiguiente =
      MES === 12 ? `${ANIO + 1}-01-01` : `${ANIO}-${String(MES + 1).padStart(2, "0")}-01`;
    await tx
      .delete(cotizaciones)
      .where(
        and(
          eq(cotizaciones.unidadNegocioId, unidadLubFiltros.id),
          gte(cotizaciones.fecha, inicioMes),
          lt(cotizaciones.fecha, inicioMesSiguiente),
        ),
      );

    let insertadas = 0;
    const sucursalesNoResueltas = new Set<string>();
    for (const grupo of grupos.values()) {
      const nombreSucursal = CODIGO_SUCURSAL[grupo.sucursalCodigo];
      const sucursalId = nombreSucursal ? sucursalMap.get(nombreSucursal.toLowerCase()) : undefined;
      if (!sucursalId) {
        sucursalesNoResueltas.add(`${grupo.sucursalCodigo} (${nombreSucursal ?? "código desconocido"})`);
        continue;
      }
      const etapa = ETAPA_POR_ESTATUS[grupo.estatus] ?? "desconocido";
      await tx.insert(cotizaciones).values({
        fecha: grupo.fecha,
        cliente: grupo.cliente,
        asesorCodigo: grupo.asesorCodigo || null,
        sucursalId,
        unidadNegocioId: unidadLubFiltros.id,
        nroCotizacion: grupo.nroCotizacion,
        monto: String(grupo.monto),
        etapa,
      });
      insertadas++;
    }
    console.log(`\n✅ ${insertadas} cotizaciones de Lub/Filtros insertadas para ${ANIO}-${MES}`);
    if (sucursalesNoResueltas.size > 0) {
      console.warn("⚠️  Códigos de sucursal no resueltos:", [...sucursalesNoResueltas]);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
