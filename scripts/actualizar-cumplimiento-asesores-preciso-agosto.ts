/**
 * Cálculo preciso de venta por asesor (CCV) en cumplimiento_asesores,
 * metodología exacta confirmada por automatizacion contra su Sheet
 * (reconcilia a diff=$0,00 en los 5 bloques):
 *
 * 1. Repuestos/Servicios/Equipos/Alquiler: getFacturasPrincipales() sobre
 *    el archivo CCV de Oportunidades Detallado, agrupado por
 *    (sucursal, unidadNegocio, codigoAsesor) -- ya trae el neteo de
 *    lubricante aplicado fila por fila (mismo bug ya corregido esta sesión).
 * 2. Lubricantes/Filtros: ventasrepuesto (archivo CCV, s92), filtrado por
 *    Cód. Suplidor lubricante. Código de vendedor = Cód. Vendedor, con
 *    fallback a Cód.Vend.OV cuando Cód. Vendedor="99999". Cliente VISCO
 *    (Cód. Cliente=45) se excluye siempre (nunca es venta de un asesor real).
 * 3. Casa = residuo, NO una suma independiente: para cada (sucursal,unidad),
 *    Casa = Total_oficial − Σ(venta de los asesores catalogados). Como este
 *    sistema no modela filas "Casa" en cumplimiento_asesores, el residuo no
 *    se inserta en ningún lado -- solo se usa para el prorrateo del punto 4.
 * 4. Prorrateo: si Σ(venta bruta de los asesores de un grupo) > Total_oficial,
 *    se reduce cada asesor por factor = Total_oficial / Σbruta (nunca se
 *    muestra más venta de la que hay presupuestada). Si no excede, factor=1.
 *
 * Match contra cumplimiento_asesores: (codigo_asesor, sucursal_id,
 * unidad_negocio_id, anio, mes) -- ya viable desde que el roster de
 * automatizacion trae sucursal por asesor (cargar-roster-asesores-ago-dic.ts).
 *
 * Uso: bun scripts/actualizar-cumplimiento-asesores-preciso-agosto.ts
 */
import * as os from "node:os";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { cumplimientoAsesores, presupuestos, sucursales, unidadesNegocio } from "@/db/schema";
import { ExcelParser, UNIDAD_LUBFILTROS, type RawRowData } from "@/lib/excel-parser";
import { leerArchivoCrudo, localizarArchivosOrdenados } from "@/lib/raw-source-reader";
import { resolverSucursalOportunidadesDetallado } from "@/lib/as400-sucursales";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? path.join(os.homedir(), "Downloads");
const now = new Date();
const ANIO = Number(process.env.ANIO) || now.getUTCFullYear();
const MES = Number(process.env.MES) || now.getUTCMonth() + 1;

const SUPLIDORES_LUBRICANTE = new Set(["CO", "DN", "D1", "GF", "NC"]);
const COD_CLIENTE_VISCO = "45";
const VENTASREPUESTO_HEADER_ROW = 8;

// Mismo mapeo código->sucursal ya usado en actualizar-cotizaciones-lubfiltros-agosto.ts
// (extraído cruzando Cód.Suc./Sucursal de ventasrepuesto) -- "05" (Los Ruices)
// se resuelve a Caracas, "46" a Machine Shop, confirmado con el usuario.
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

function elegirArchivoDelMes(patron: RegExp, headerRow: number): RawRowData[] {
  const candidatos = localizarArchivosOrdenados(DOWNLOADS_DIR, patron);
  if (candidatos.length === 0) throw new Error(`No se encontró ningún archivo que matchee ${patron}`);
  for (const archivo of candidatos) {
    const filas = leerArchivoCrudo(archivo, headerRow);
    const tieneMes = filas.some((row) => {
      const mes = parseInt(String(row["Mes"] ?? ""), 10);
      const anio = parseInt(String(row["Año"] ?? ""), 10);
      return mes === MES && anio === ANIO;
    });
    if (tieneMes) {
      console.log(`→ Leyendo ${archivo}`);
      return filas;
    }
  }
  console.warn(`⚠️  Ninguno de los candidatos para ${patron} trae filas de ${ANIO}-${MES}; usando el más reciente igual.`);
  return leerArchivoCrudo(candidatos[0], headerRow);
}

type Clave = string; // `${sucursal}|${unidad}|${codigoAsesor}`
const clave = (sucursal: string, unidad: string, codigoAsesor: string): Clave =>
  `${sucursal}|${unidad}|${codigoAsesor}`;

async function main() {
  // --- 1. Repuestos/Servicios/Equipos/Alquiler desde Oportunidades Detallado (CCV) ---
  const archivoCcv = localizarArchivosOrdenados(
    DOWNLOADS_DIR,
    /^ReporteEmbudoOppDetallado_(?!.*xibi)(?!.*otra).*\.xlsx$/i,
  )[0];
  console.log(`→ Leyendo ${archivoCcv}`);
  const rowsCcv = leerArchivoCrudo(archivoCcv, 12).map(resolverSucursalOportunidadesDetallado);
  const parser = new ExcelParser("", { sheetNames: ["Facturacion"], sheets: { Facturacion: rowsCcv } });
  const facturas = parser.getFacturasPrincipales();

  const ventaPorClave = new Map<Clave, number>();
  facturas.forEach((f) => {
    if (!f.codigoAsesor || !f.unidadNegocio) return;
    if (f.unidadNegocio === UNIDAD_LUBFILTROS) return; // Lub/Filtros sale de ventasrepuesto, no de aquí
    if (!(f.fecha ?? "").startsWith(`${ANIO}-${String(MES).padStart(2, "0")}`)) return;
    const k = clave(f.sucursal, f.unidadNegocio, f.codigoAsesor);
    ventaPorClave.set(k, (ventaPorClave.get(k) ?? 0) + f.monto);
  });

  // --- 2. Lubricantes/Filtros desde ventasrepuesto (CCV, s92) ---
  const filasVentasrepuesto = elegirArchivoDelMes(
    /^ventasrepuesto_s92anap32todas_.*\.xls$/i,
    VENTASREPUESTO_HEADER_ROW,
  );
  filasVentasrepuesto.forEach((row) => {
    const suplidor = (row["Cód. Suplidor"] ?? "").toString().trim().toUpperCase();
    if (!SUPLIDORES_LUBRICANTE.has(suplidor)) return;
    const mes = parseInt(String(row["Mes"] ?? ""), 10);
    const anio = parseInt(String(row["Año"] ?? ""), 10);
    if (mes !== MES || anio !== ANIO) return;
    const codCliente = (row["Cód. Cliente"] ?? "").toString().trim().replace(/^0+/, "");
    if (codCliente === COD_CLIENTE_VISCO) return; // VISCO nunca es de un asesor real

    const codVendedor = (row["Cód. Vendedor"] ?? "").toString().trim();
    const codigoAsesor = codVendedor === "99999" ? (row["Cód.Vend.OV"] ?? "").toString().trim() : codVendedor;
    if (!codigoAsesor) return;

    const codigoSucursal = (row["Cód.Suc."] ?? "").toString().trim();
    const sucursal = CODIGO_SUCURSAL[codigoSucursal];
    if (!sucursal) return;

    const monto = parseFloat(String(row["P.V.P. Total $ Extendido"] ?? "0").replace(/,/g, "")) || 0;
    const k = clave(sucursal, UNIDAD_LUBFILTROS, codigoAsesor);
    ventaPorClave.set(k, (ventaPorClave.get(k) ?? 0) + monto);
  });

  console.log(`→ ${ventaPorClave.size} combinaciones sucursal+unidad+asesor con venta bruta`);

  // --- 3 y 4. Casa como residuo + prorrateo por (sucursal, unidad) ---
  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const unidadMap = new Map(unidadesRows.map((u) => [u.nombre.trim().toLowerCase(), u.id]));

    // Total oficial por (sucursal, unidad) -- ventas_ccv de presupuestos, ya reconciliado hoy.
    const oficialRows = await tx
      .select({
        sucursalId: presupuestos.sucursalId,
        unidadNegocioId: presupuestos.unidadNegocioId,
        ventasCcv: presupuestos.ventasCcv,
      })
      .from(presupuestos)
      .where(and(eq(presupuestos.anio, ANIO), eq(presupuestos.mes, MES)));
    const oficialPorSucursalUnidad = new Map<string, number>();
    oficialRows.forEach((r) => {
      if (!r.sucursalId || !r.unidadNegocioId) return;
      oficialPorSucursalUnidad.set(`${r.sucursalId}|${r.unidadNegocioId}`, Number(r.ventasCcv ?? 0));
    });

    // Catálogo de filas existentes para el mes -- se usa para separar bruto de
    // asesores catalogados (entran al prorrateo) de bruto sin catalogar
    // (mostrador genérico/código desconocido: cae a Casa, no infla el
    // denominador del prorrateo de los asesores reales).
    const filasExistentes = await tx
      .select({
        id: cumplimientoAsesores.id,
        codigoAsesor: cumplimientoAsesores.codigoAsesor,
        sucursalId: cumplimientoAsesores.sucursalId,
        unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
        presupuesto: cumplimientoAsesores.presupuesto,
      })
      .from(cumplimientoAsesores)
      .where(and(eq(cumplimientoAsesores.anio, ANIO), eq(cumplimientoAsesores.mes, MES)));
    const existentesPorClave = new Map(
      filasExistentes.map((f) => [`${f.codigoAsesor}|${f.sucursalId}|${f.unidadNegocioId}`, f]),
    );

    // Agrupar las claves por (sucursal, unidad) para calcular el factor de prorrateo.
    const gruposPorSucursalUnidad = new Map<string, { sucursal: string; unidad: string; codigoAsesor: string; bruto: number }[]>();
    for (const [k, bruto] of ventaPorClave) {
      const [sucursal, unidad, codigoAsesor] = k.split("|");
      const gk = `${sucursal}|${unidad}`;
      if (!gruposPorSucursalUnidad.has(gk)) gruposPorSucursalUnidad.set(gk, []);
      gruposPorSucursalUnidad.get(gk)!.push({ sucursal, unidad, codigoAsesor, bruto });
    }

    let actualizadas = 0;
    const noResueltas: string[] = [];
    for (const [gk, items] of gruposPorSucursalUnidad) {
      const sucursalId = sucursalMap.get(items[0].sucursal.trim().toLowerCase());
      const unidadId = unidadMap.get(items[0].unidad.trim().toLowerCase());
      if (!sucursalId || !unidadId) {
        noResueltas.push(`grupo ${gk}`);
        continue;
      }
      const totalOficial = oficialPorSucursalUnidad.get(`${sucursalId}|${unidadId}`) ?? 0;

      const catalogados = items.filter((i) => existentesPorClave.has(`${i.codigoAsesor}|${sucursalId}|${unidadId}`));
      const sinCatalogar = items.length - catalogados.length;
      const sumaBruta = catalogados.reduce((s, i) => s + i.bruto, 0);
      // MAX(0, MIN(1, oficial/bruta)) -- si oficial es negativo o bruta es 0
      // pero oficial>0 (sin ventas de asesores reales), el factor nunca es
      // negativo (recomendación de automatizacion 2026-09-03).
      const factor = sumaBruta > 0 ? Math.max(0, Math.min(1, totalOficial / sumaBruta)) : 1;
      const casa = Math.max(0, totalOficial - sumaBruta * factor);
      if (sinCatalogar > 0) {
        noResueltas.push(
          ...items
            .filter((i) => !existentesPorClave.has(`${i.codigoAsesor}|${sucursalId}|${unidadId}`))
            .map((i) => `${i.codigoAsesor}|${i.sucursal}|${i.unidad} (sin catalogar, va a Casa)`),
        );
      }

      for (const item of catalogados) {
        const ventaMostrada = item.bruto * factor;
        const existente = existentesPorClave.get(`${item.codigoAsesor}|${sucursalId}|${unidadId}`);
        if (!existente) {
          continue;
        }
        const presupuesto = Number(existente.presupuesto);
        const pct = presupuesto > 0 ? Math.min((ventaMostrada / presupuesto) * 100, 999.9999) : 0;
        await tx
          .update(cumplimientoAsesores)
          .set({ venta: String(ventaMostrada), ventaCcv: String(ventaMostrada), pctCumplimiento: String(pct) })
          .where(eq(cumplimientoAsesores.id, existente.id));
        actualizadas++;
      }
      if (factor < 1) {
        console.log(
          `↓ Prorrateo ${gk}: bruto=${sumaBruta.toFixed(2)} > oficial=${totalOficial.toFixed(2)} → factor=${factor.toFixed(4)}`,
        );
      }
      console.log(`  Casa ${gk}: ${casa.toFixed(2)}`);
    }

    console.log(`\n✅ ${actualizadas} filas de cumplimiento_asesores actualizadas con venta precisa`);
    if (noResueltas.length > 0) {
      console.warn(`⚠️  ${noResueltas.length} combinaciones sin fila correspondiente:`, noResueltas.slice(0, 20));
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
