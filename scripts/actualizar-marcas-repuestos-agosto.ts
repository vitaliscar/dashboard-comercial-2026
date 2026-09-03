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
import { presupuestos, unidadesNegocio, detallesVentasRepuestos } from "@/db/schema";
import { leerArchivoCrudo, localizarArchivosOrdenados, type RawRowData } from "@/lib/raw-source-reader";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const HEADER_ROW = 8;
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

const PATRONES = [
  { patron: /^ventasrepuesto_s92anap32todas_.*\.xls$/i, compania: "CCV" as const },
  { patron: /^ventasrepuesto_g37anap33todas_.*\.xls$/i, compania: "Xibi" as const },
];

// Mismos códigos que SUPLIDORES_LUBRICANTE en as400-lubricantes.ts -- esas
// filas ya se contabilizan en Lubricantes/Filtros, no en Repuestos.
const CODIGOS_LUBRICANTE = new Set(["CO", "DN", "D1", "GF", "NC"]);
// Confirmado con el usuario 2026-09-02: proveedores "misceláneo"/"flota" sin
// marca propia -- se excluyen de esta tabla (no se re-clasifican, se
// descartan). Códigos conocidos + fallback por nombre (Nacional Miscelaneo,
// Miscelaneo Internacional, Nacional Flota, o cualquier variante que
// contenga "miscelane"/"flota") por si aparece un código nuevo.
const CODIGOS_EXCLUIDOS_MISCELANEO = new Set(["NM", "MJ", "NF"]);
const esProveedorExcluidoPorNombre = (nombre: string): boolean => {
  const n = nombre.toLowerCase();
  return n.includes("miscelane") || n.includes("flota");
};

// Ventas de repuestos de Xibi trae ventas internas a CCV (transferencia
// intercompañía) que hay que excluir -- mismo Cód. Cliente=35 ya usado en
// as400-lubricantes.ts (ES_SUCURSAL_XIBI_NO_REAL/esTransferenciaIntercompaniaXibi).
// Confirmado con el usuario 2026-09-02: sin esto, el total de Xibi
// tradicionales quedaba casi 3x por encima del oficial reconciliado.
const COD_CLIENTE_INTERCOMPANIA_XIBI = "35";
const esIntercompaniaXibi = (row: RawRowData): boolean =>
  (row["Cód. Cliente"] ?? "").toString().trim().replace(/^0+/, "") === COD_CLIENTE_INTERCOMPANIA_XIBI;

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
    const nombreSuplidor = (row["Suplidor"] ?? "").toString().trim();
    if (
      CODIGOS_LUBRICANTE.has(codigo) ||
      CODIGOS_EXCLUIDOS_MISCELANEO.has(codigo) ||
      esProveedorExcluidoPorNombre(nombreSuplidor)
    )
      return;
    if (compania === "Xibi" && esIntercompaniaXibi(row)) return;
    const mes = parseInt(String(row["Mes"] ?? ""), 10);
    const anio = parseInt(String(row["Año"] ?? ""), 10);
    if (mes !== MES || anio !== ANIO) return;
    const marca = MAPEO_MARCA[codigo] ?? "No Definido";
    const monto = num(row["P.V.P. Total $ Extendido"]);
    if (!totales[marca]) totales[marca] = { ccv: 0, xibi: 0 };
    if (compania === "CCV") totales[marca].ccv += monto;
    else totales[marca].xibi += monto;
  });
}

/**
 * Todo lo que no cuadre entre esta hoja de "tradicionales" y el monto
 * oficial de Repuestos (presupuestos.ventas_ccv/ventas_xibi, ya reconciliado
 * contra el cuadro real esta sesión) va a "No Definido" -- confirmado con
 * el usuario 2026-09-02. Nunca resta (si el identificado ya supera el
 * oficial, no se fuerza un ajuste negativo).
 */
async function ajustarResidualNoDefinido(totales: Totales): Promise<void> {
  const rows = await dbAdmin
    .select({ ccv: presupuestos.ventasCcv, xibi: presupuestos.ventasXibi })
    .from(presupuestos)
    .innerJoin(unidadesNegocio, eq(unidadesNegocio.id, presupuestos.unidadNegocioId))
    .where(
      and(
        eq(unidadesNegocio.nombre, "Repuestos"),
        eq(presupuestos.anio, ANIO),
        eq(presupuestos.mes, MES),
      ),
    );

  const oficialCcv = rows.reduce((s, r) => s + Number(r.ccv), 0);
  const oficialXibi = rows.reduce((s, r) => s + Number(r.xibi), 0);

  const identificadoCcv = Object.values(totales).reduce((s, t) => s + t.ccv, 0);
  const identificadoXibi = Object.values(totales).reduce((s, t) => s + t.xibi, 0);
  const residualCcv = Math.max(0, oficialCcv - identificadoCcv);
  const residualXibi = Math.max(0, oficialXibi - identificadoXibi);

  console.log(
    `\nOficial CCV=${oficialCcv.toFixed(2)} vs identificado=${identificadoCcv.toFixed(2)} → residuo No Definido CCV=${residualCcv.toFixed(2)}`,
  );
  console.log(
    `Oficial Xibi=${oficialXibi.toFixed(2)} vs identificado=${identificadoXibi.toFixed(2)} → residuo No Definido Xibi=${residualXibi.toFixed(2)}`,
  );

  if (!totales["No Definido"]) totales["No Definido"] = { ccv: 0, xibi: 0 };
  totales["No Definido"].ccv += residualCcv;
  totales["No Definido"].xibi += residualXibi;
}

// La automatización puede dejar más de un archivo ventasrepuesto en una
// corrida (distintas ventanas de fecha) -- probar candidatos del más
// reciente al más viejo hasta hallar uno que traiga filas de ANIO/MES.
function leerFilasDelMes(patron: RegExp): RawRowData[] {
  const candidatos = localizarArchivosOrdenados(DOWNLOADS_DIR, patron);
  if (candidatos.length === 0) {
    throw new Error(`No se encontró ningún archivo que matchee ${patron}`);
  }
  for (const archivo of candidatos) {
    const filas = leerArchivoCrudo(archivo, HEADER_ROW);
    const tieneMes = filas.some(
      (row) => parseInt(String(row["Mes"] ?? ""), 10) === MES && parseInt(String(row["Año"] ?? ""), 10) === ANIO,
    );
    if (tieneMes) {
      console.log(`→ Leyendo ${archivo}`);
      return filas;
    }
  }
  console.warn(
    `⚠️  Ninguno de los ${candidatos.length} archivos para ${patron} trae filas de ${ANIO}-${MES}; usando el más reciente igual: ${candidatos[0]}`,
  );
  return leerArchivoCrudo(candidatos[0], HEADER_ROW);
}

async function main() {
  const totales: Totales = {};
  for (const { patron, compania } of PATRONES) {
    try {
      const filas = leerFilasDelMes(patron);
      sumarPorMarca(filas, compania, totales);
    } catch (error) {
      console.warn(`⚠️  No se encontró archivo para patrón ${patron}: ${(error as Error).message}`);
    }
  }

  await ajustarResidualNoDefinido(totales);

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
