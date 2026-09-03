/**
 * Reconstruye detalles_ventas_lubfiltros (marca x mes, CCV/Xibi/Estratégicas)
 * para agosto 2026 desde el crudo AS400 `ventasrepuesto`, usando las mismas
 * filas que ya filtra leerFilasLubricanteVentasrepuesto() (Cód. Suplidor en
 * {CO,DN,D1,GF,NC}, excluyendo la transferencia intercompañía Xibi->CCV).
 *
 * Mapeo código->marca confirmado con el usuario 2026-09-02:
 *   NC, GF, DN -> Donaldson
 *   CO -> Chronus
 *   D1 -> Donaldson Industrial
 *
 * No hay archivo ventasrepuesto de "Otra Empresa" -- el residuo contra el
 * oficial de Lub/Filtros (presupuestos.ventas_estrategicas) va completo a
 * "No Definido", mismo patrón ya aplicado en Repuestos.
 *
 * Uso: bun scripts/actualizar-marcas-lubfiltros-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { presupuestos, unidadesNegocio, detallesVentasLubfiltros } from "@/db/schema";
import { leerFilasLubricanteVentasrepuesto } from "@/lib/as400-lubricantes";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

const MAPEO_MARCA: Record<string, string> = {
  NC: "Donaldson",
  GF: "Donaldson",
  DN: "Donaldson",
  CO: "Chronus",
  D1: "Donaldson Industrial",
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

type Totales = { [marca: string]: { ccv: number; xibi: number } };

async function main() {
  const filas = leerFilasLubricanteVentasrepuesto(DOWNLOADS_DIR, ANIO, MES);
  const totales: Totales = {};

  filas.forEach((row) => {
    const mes = parseInt(String(row["Mes"] ?? ""), 10);
    const anio = parseInt(String(row["Año"] ?? ""), 10);
    if (mes !== MES || anio !== ANIO) return;
    const codigo = (row["Cód. Suplidor"] ?? "").toString().trim().toUpperCase();
    const marca = MAPEO_MARCA[codigo] ?? "Otra Marca";
    const compania = (row["Compañía"] ?? row["Compañia"] ?? "").toString().trim().toUpperCase();
    const monto = num(row["P.V.P. Total $ Extendido"]);
    if (!totales[marca]) totales[marca] = { ccv: 0, xibi: 0 };
    if (compania.includes("XIBI")) totales[marca].xibi += monto;
    else totales[marca].ccv += monto;
  });

  const [fila] = await dbAdmin
    .select({ ccv: presupuestos.ventasCcv, xibi: presupuestos.ventasXibi, est: presupuestos.ventasEstrategicas })
    .from(presupuestos)
    .innerJoin(unidadesNegocio, eq(unidadesNegocio.id, presupuestos.unidadNegocioId))
    .where(
      and(
        eq(unidadesNegocio.nombre, "Lubricantes/Filtros"),
        eq(presupuestos.anio, ANIO),
        eq(presupuestos.mes, MES),
      ),
    )
    .then((rows) =>
      rows.length === 0
        ? [{ ccv: "0", xibi: "0", est: "0" }]
        : rows.reduce(
            (acc, r) => [
              {
                ccv: String(Number(acc[0].ccv) + Number(r.ccv)),
                xibi: String(Number(acc[0].xibi) + Number(r.xibi)),
                est: String(Number(acc[0].est) + Number(r.est)),
              },
            ],
            [{ ccv: "0", xibi: "0", est: "0" }],
          ),
    );

  const identificadoCcv = Object.values(totales).reduce((s, t) => s + t.ccv, 0);
  const identificadoXibi = Object.values(totales).reduce((s, t) => s + t.xibi, 0);
  const residualCcv = Math.max(0, Number(fila.ccv) - identificadoCcv);
  const residualXibi = Math.max(0, Number(fila.xibi) - identificadoXibi);
  const residualEst = Math.max(0, Number(fila.est));

  console.log(`Oficial CCV=${fila.ccv} vs identificado=${identificadoCcv.toFixed(2)} → No Definido CCV=${residualCcv.toFixed(2)}`);
  console.log(`Oficial Xibi=${fila.xibi} vs identificado=${identificadoXibi.toFixed(2)} → No Definido Xibi=${residualXibi.toFixed(2)}`);
  console.log(`Oficial Estratégicas=${fila.est} (sin fuente de marca) → No Definido Est=${residualEst.toFixed(2)}`);

  await dbAdmin.transaction(async (tx) => {
    await tx.delete(detallesVentasLubfiltros).where(eq(detallesVentasLubfiltros.mes, MES));

    const inserts = Object.entries(totales).map(([marca, { ccv, xibi }]) => ({
      marca,
      mes: MES,
      ventasCcv: String(ccv),
      ventasXibi: String(xibi),
      ventasEstrategicas: "0",
      montoTotal: String(ccv + xibi),
    }));
    inserts.push({
      marca: "No Definido",
      mes: MES,
      ventasCcv: String(residualCcv),
      ventasXibi: String(residualXibi),
      ventasEstrategicas: String(residualEst),
      montoTotal: String(residualCcv + residualXibi + residualEst),
    });

    await tx.insert(detallesVentasLubfiltros).values(inserts);
    inserts
      .sort((a, b) => Number(b.montoTotal) - Number(a.montoTotal))
      .forEach((f) =>
        console.log(`✓ ${f.marca}: CCV=${f.ventasCcv} Xibi=${f.ventasXibi} Est=${f.ventasEstrategicas} Total=${f.montoTotal}`),
      );
    console.log(`\n✅ ${inserts.length} marcas insertadas para mes=${MES}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
