/**
 * Reconstruye detalles_ventas_repuestos (marca x mes, CCV/Xibi) para agosto
 * 2026 desde el crudo AS400 `ventasrepuesto` (reporte "tradicionales"),
 * excluyendo Lubricantes/Filtros (mismos códigos que
 * src/lib/as400-lubricantes.ts) y los proveedores "Miscelaneo"
 * (Nacional Miscelaneo, Miscelaneo Internacional, Nacional Flota) —
 * confirmado con el usuario 2026-09-02: esos no son marca, son cajón de
 * sastre sin dueño comercial.
 *
 * La tabla existente traía agosto casi todo en $0 con 2 filas duplicadas
 * de monto inventado (mismo patrón de datos falsos que presupuestos) —
 * nunca se había cargado con datos reales de agosto por ningún proceso.
 *
 * Uso: bun scripts/actualizar-marcas-repuestos-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { detallesVentasRepuestos } from "@/db/schema";
import { leerArchivoCrudo, localizarArchivoMasReciente, type RawRowData } from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 8;
const MES = 8;

const PATRONES = [
  { patron: /^ventasrepuesto_s92anap32todas_.*\.xls$/i, compania: "CCV" as const },
  { patron: /^ventasrepuesto_g37anap33todas_.*\.xls$/i, compania: "Xibi" as const },
];

// Mismos códigos que SUPLIDORES_LUBRICANTE en as400-lubricantes.ts -- esas
// filas ya se contabilizan en Lubricantes/Filtros, no en Repuestos.
const CODIGOS_LUBRICANTE = new Set(["CO", "DN", "D1", "GF", "NC"]);
// Confirmado con el usuario 2026-09-02: proveedores "misceláneo" sin marca
// propia -- se excluyen de esta tabla (no se re-clasifican, se descartan).
const CODIGOS_EXCLUIDOS_MISCELANEO = new Set(["NM", "MJ", "NF"]);

const MAPEO_MARCA: Record<string, string> = {
  BQ: "Blumaq",
  CA: "Caterpillar",
  DU: "Duncan",
  FG: "FG Wilson",
  MS: "Vms Corporation",
  SO: "Laboratorio Sos",
  T1: "Tvh",
  TJ: "CTP",
  LT: "Mitsubishi",
  KO: "Kohler",
  LV: "Venoco",
  NA: "Caterpillar",
  PC: "Generac",
  SW: "Weichai",
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

type Totales = { [marca: string]: { ccv: number; xibi: number } };

function sumarPorMarca(rows: RawRowData[], compania: "CCV" | "Xibi", totales: Totales) {
  rows.forEach((row) => {
    const codigo = (row["Cód. Suplidor"] ?? "").toString().trim().toUpperCase();
    if (CODIGOS_LUBRICANTE.has(codigo) || CODIGOS_EXCLUIDOS_MISCELANEO.has(codigo)) return;
    const mes = parseInt(String(row["Mes"] ?? ""), 10);
    const anio = parseInt(String(row["Año"] ?? ""), 10);
    if (mes !== MES || anio !== 2026) return;
    const marca = MAPEO_MARCA[codigo] ?? "No Definido";
    const monto = num(row["P.V.P. Total $ Extendido"]);
    if (!totales[marca]) totales[marca] = { ccv: 0, xibi: 0 };
    if (compania === "CCV") totales[marca].ccv += monto;
    else totales[marca].xibi += monto;
  });
}

async function main() {
  const totales: Totales = {};
  for (const { patron, compania } of PATRONES) {
    try {
      const archivo = localizarArchivoMasReciente(DOWNLOADS_DIR, patron);
      console.log(`→ Leyendo ${archivo} (${compania})`);
      const filas = leerArchivoCrudo(archivo, HEADER_ROW);
      sumarPorMarca(filas, compania, totales);
    } catch (error) {
      console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
    }
  }

  await dbAdmin.transaction(async (tx) => {
    await tx.delete(detallesVentasRepuestos).where(eq(detallesVentasRepuestos.mes, MES));

    const filas = Object.entries(totales).map(([marca, { ccv, xibi }]) => ({
      marca,
      mes: MES,
      ventasCcv: String(ccv),
      ventasXibi: String(xibi),
      montoTotal: String(ccv + xibi),
    }));
    if (filas.length > 0) {
      await tx.insert(detallesVentasRepuestos).values(filas);
    }
    filas
      .sort((a, b) => Number(b.montoTotal) - Number(a.montoTotal))
      .forEach((f) => console.log(`✓ ${f.marca}: CCV=${f.ventasCcv} Xibi=${f.ventasXibi} Total=${f.montoTotal}`));
    console.log(`\n✅ ${filas.length} marcas insertadas para mes=${MES}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
