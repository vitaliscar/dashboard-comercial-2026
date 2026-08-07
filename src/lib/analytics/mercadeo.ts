/**
 * Agregaciones puras para el módulo Mercadeo (métricas digitales + embudo).
 * Sin React ni Drizzle — testeable en aislamiento.
 */

import { getAllowedMonths, type MonthFilter } from "@/lib/date-range";
import { MESES } from "@/lib/format";

export interface MesRow {
  mes: number;
  cantidad: number | string;
}

/** Suma numérica de un campo en filas filtradas por mes. */
export function sumCantidad(rows: MesRow[], mesesPermitidos?: number[]): number {
  return rows
    .filter((r) => mesesPermitidos === undefined || mesesPermitidos.includes(r.mes))
    .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0);
}

/** Etiquetas cortas de mes para el eje X, respetando el filtro activo. */
export function mesLabelsForFilter(anio: number, meses: MonthFilter, now = new Date()): string[] {
  return getAllowedMonths(anio, meses, now).map((m) => MESES[m - 1].slice(0, 3));
}

/** Meses con cantidad distinta de cero en el dataset (eje X de gráficos Mercadeo). */
export function mesesConDatos<T extends MesRow>(rows: T[]): number[] {
  const meses = new Set<number>();
  rows.forEach((row) => {
    if (Number(row.cantidad ?? 0) !== 0) meses.add(row.mes);
  });
  return [...meses].sort((a, b) => a - b);
}

/**
 * Meses a resaltar en barras de Mercadeo: los del filtro activo, o todos los
 * meses con datos si el filtro es "all".
 */
export function getMercadeoHighlightLabels(
  meses: MonthFilter,
  mesesEnGrafico: number[],
): string[] {
  if (meses === "all") {
    return mesesEnGrafico.map((m) => MESES[m - 1].slice(0, 3));
  }
  const permitidos = new Set(meses);
  return mesesEnGrafico
    .filter((m) => permitidos.has(m))
    .map((m) => MESES[m - 1].slice(0, 3));
}

/**
 * Serie temporal para gráficos de línea: una clave por serie (canal, tipo, etc.).
 * El eje X muestra solo meses con información en el dataset.
 */
export function buildMercadeoLineSeries<T extends MesRow>(
  rows: T[],
  seriesKeys: string[],
  getKey: (row: T) => string,
): Record<string, string | number>[] {
  return mesesConDatos(rows).map((mes) => {
    const punto: Record<string, string | number> = { mes: MESES[mes - 1].slice(0, 3) };
    seriesKeys.forEach((key) => {
      punto[key] = rows
        .filter((r) => r.mes === mes && getKey(r) === key)
        .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0);
    });
    return punto;
  });
}

/** Ranking con % del total para tooltips y barras. */
export function rankedWithPct(
  entries: { label: string; value: number }[],
): { label: string; value: number; pct: number }[] {
  const total = entries.reduce((s, e) => s + e.value, 0);
  return entries
    .map((e) => ({
      ...e,
      pct: total === 0 ? 0 : Math.round((e.value / total) * 1000) / 10,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Agrupa filas por etiqueta y suma cantidad. */
export function groupSum<T>(
  rows: T[],
  labelFn: (row: T) => string,
  valueFn: (row: T) => number,
): { label: string; value: number }[] {
  const grupos = new Map<string, number>();
  rows.forEach((r) => {
    const label = labelFn(r);
    grupos.set(label, (grupos.get(label) ?? 0) + valueFn(r));
  });
  return [...grupos.entries()].map(([label, value]) => ({ label, value }));
}

export interface EmbudoEtapa {
  estatus: string;
  cantidad: number;
  /** % del total de leads en el período. */
  pctTotal: number;
  /** % respecto a la etapa anterior del embudo (null en la primera). */
  pctEtapaAnterior: number | null;
}

/** Embudo con tasas de conversión entre etapas consecutivas. */
export function computeEmbudoConPct(
  embudo: { estatus: string; cantidad: number }[],
): EmbudoEtapa[] {
  const total = embudo.reduce((s, e) => s + e.cantidad, 0);
  return embudo.map((etapa, i) => {
    const anterior = i > 0 ? embudo[i - 1].cantidad : null;
    return {
      estatus: etapa.estatus,
      cantidad: etapa.cantidad,
      pctTotal: total === 0 ? 0 : Math.round((etapa.cantidad / total) * 1000) / 10,
      pctEtapaAnterior:
        anterior === null || anterior === 0
          ? null
          : Math.round((etapa.cantidad / anterior) * 1000) / 10,
    };
  });
}

export function formatMercadeoNumero(valor: number): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 10_000) return `${Math.round(valor / 1_000)}K`;
  return valor.toLocaleString("es-VE");
}

/** Canales de la columna A de la hoja "Canales" (sin Instagram — tiene hoja propia). */
export const CANALES_DIGITALES = [
  "Pagina Web",
  "Linkedin",
  "Facebook",
  "Whatsapp",
  "Movil",
  "Youtube",
] as const;

const ORDEN_CANAL = new Map(
  CANALES_DIGITALES.map((c, i) => [c.toLowerCase(), i] as const),
);

/** Instagram en la hoja Canales es un agregado; el detalle vive en la hoja Instagram. */
export function esCanalHojaCanales(canal: string): boolean {
  return canal.trim().toLowerCase() !== "instagram";
}

export function ordenarCanales(canales: string[]): string[] {
  return [...canales].sort((a, b) => {
    const ia = ORDEN_CANAL.get(a.toLowerCase()) ?? 99;
    const ib = ORDEN_CANAL.get(b.toLowerCase()) ?? 99;
    return ia - ib;
  });
}

/** Agrupa canales por métrica (tipo). Cada canal trae tipos distintos en el Excel. */
export function agruparCanalesPorTipo<T>(
  rows: T[],
  getCanal: (row: T) => string,
  getTipo: (row: T) => string,
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  rows.forEach((row) => {
    const tipo = getTipo(row);
    const canal = getCanal(row);
    if (!map.has(tipo)) map.set(tipo, new Set());
    map.get(tipo)!.add(canal);
  });
  return new Map(
    [...map.entries()].map(([tipo, canales]) => [tipo, ordenarCanales([...canales])]),
  );
}

/**
 * Métrica inicial del gráfico de canales. Antes se usaba "Alcance", que solo
 * existe en Facebook — daba la impresión de que faltaban datos del Excel.
 */
export function tipoPorDefectoCanales(
  tipos: string[],
  canalesPorTipo: Map<string, string[]>,
): string | null {
  if (tipos.length === 0) return null;
  if (tipos.includes("Visualizaciones")) return "Visualizaciones";
  let mejor = tipos[0];
  let maxCanales = 0;
  tipos.forEach((tipo) => {
    const n = canalesPorTipo.get(tipo)?.length ?? 0;
    if (n > maxCanales) {
      maxCanales = n;
      mejor = tipo;
    }
  });
  return mejor;
}

const ORDEN_TIPO_INSTAGRAM = [
  "Visualizaciones",
  "Alcance",
  "Interacciones",
  "Seguidores",
  "Clicks en enlace",
  "Visitas",
] as const;

export function ordenarTiposInstagram(tipos: string[]): string[] {
  const orden = new Map(ORDEN_TIPO_INSTAGRAM.map((t, i) => [t.toLowerCase(), i]));
  return [...tipos].sort((a, b) => {
    const ia = orden.get(a.toLowerCase()) ?? 99;
    const ib = orden.get(b.toLowerCase()) ?? 99;
    return ia - ib;
  });
}

/**
 * Serie para barras apiladas: un punto por mes con datos, una clave por segmento
 * (canal en hoja Canales, o tipo en hoja Instagram).
 */
export function buildMercadeoStackedSeries<T extends MesRow>(
  rows: T[],
  segmentKeys: string[],
  getSegment: (row: T) => string,
): Record<string, string | number>[] {
  return mesesConDatos(rows).map((mes) => {
    const punto: Record<string, string | number> = { mes: MESES[mes - 1].slice(0, 3) };
    segmentKeys.forEach((key) => {
      punto[key] = rows
        .filter((r) => r.mes === mes && getSegment(r) === key)
        .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0);
    });
    return punto;
  });
}
