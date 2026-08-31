import { MESES } from "@/lib/format";

export type MonthFilter = number[] | "all";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Días vencidos desde una fecha de vencimiento, calculados en el momento
 * (no confiar en la columna "Dias Vencidos"/"DIAS VENCIDO" del Excel — es un
 * snapshot del día de la carga, se desactualiza cada día que pasa sin
 * recargar). Negativo = todavía no vence.
 */
export function diasVencidosDesde(fechaVencimiento: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(fechaVencimiento).getTime()) / 86400000);
}

export function getAllMonthsCap(anio: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (anio < currentYear) return 12;
  if (anio === currentYear) return currentMonth;
  return 0;
}

/**
 * Meses (abreviados) a resaltar en gráficos de tendencia anual: los
 * seleccionados en el filtro, o el mes actual si el filtro es "all".
 */
export function getHighlightMonthLabels(meses: MonthFilter, now = new Date()): string[] {
  if (meses === "all") return [MESES[now.getMonth()].slice(0, 3)];
  return meses.map((m) => MESES[m - 1].slice(0, 3));
}

export function getDateRangesForMonths(
  anio: number,
  meses: MonthFilter,
  now = new Date(),
): DateRange[] {
  if (meses === "all") {
    const monthCap = getAllMonthsCap(anio, now);
    if (monthCap === 0) return [];
    return [
      {
        from: `${anio}-01-01`,
        to: new Date(anio, monthCap, 1).toISOString().slice(0, 10),
      },
    ];
  }

  const sorted = [...meses].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const ranges: DateRange[] = [];
  let startMonth = sorted[0];
  let lastMonth = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === lastMonth + 1) {
      lastMonth = sorted[i];
    } else {
      ranges.push({
        from: `${anio}-${String(startMonth).padStart(2, "0")}-01`,
        to: new Date(anio, lastMonth, 1).toISOString().slice(0, 10),
      });
      startMonth = sorted[i];
      lastMonth = sorted[i];
    }
  }
  ranges.push({
    from: `${anio}-${String(startMonth).padStart(2, "0")}-01`,
    to: new Date(anio, lastMonth, 1).toISOString().slice(0, 10),
  });

  return ranges;
}

/**
 * Rango del mes inmediatamente anterior al mes seleccionado, para comparativas
 * "vs. mes anterior". Solo tiene sentido cuando el filtro es un único mes —
 * con selección múltiple o "all" (YTD) no hay un "mes anterior" inequívoco.
 */
export function getPreviousMonthRange(anio: number, meses: MonthFilter): DateRange[] {
  if (meses === "all" || meses.length !== 1) return [];

  const mes = meses[0];
  const prevMes = mes === 1 ? 12 : mes - 1;
  const prevAnio = mes === 1 ? anio - 1 : anio;

  return [
    {
      from: `${prevAnio}-${String(prevMes).padStart(2, "0")}-01`,
      to: new Date(prevAnio, prevMes, 1).toISOString().slice(0, 10),
    },
  ];
}

export function applyDateRangesToQuery<T>(q: T, ranges: DateRange[], dateColumn = "fecha"): T {
  if (ranges.length === 0) {
    return q;
  }
  const qb = q as {
    gte: (col: string, val: string) => typeof qb;
    lt: (col: string, val: string) => typeof qb;
    or: (condition: string) => typeof qb;
  };
  if (ranges.length === 1) {
    return qb.gte(dateColumn, ranges[0].from).lt(dateColumn, ranges[0].to) as T;
  }
  // format: and(fecha.gte.2026-01-01,fecha.lt.2026-02-01),and(fecha.gte.2026-03-01,fecha.lt.2026-04-01)
  const orCondition = ranges
    .map((r) => `and(${dateColumn}.gte.${r.from},${dateColumn}.lt.${r.to})`)
    .join(",");
  return qb.or(orCondition) as T;
}

/**
 * Igual semántica que applyMonthFilterToQuery pero para filtrar en memoria un
 * array ya cargado (p. ej. el resultado de un RPC que no acepta filtro de mes).
 */
export function getAllowedMonths(anio: number, meses: MonthFilter, now = new Date()): number[] {
  if (meses === "all") {
    const monthCap = getAllMonthsCap(anio, now);
    return Array.from({ length: monthCap }, (_, i) => i + 1);
  }
  return meses;
}

export function applyMonthFilterToQuery<T>(
  q: T,
  meses: MonthFilter,
  anio: number,
  now = new Date(),
  monthColumn = "mes",
): T {
  const qb = q as {
    in: (col: string, val: number[]) => typeof qb;
  };
  if (meses === "all") {
    const monthCap = getAllMonthsCap(anio, now);
    if (monthCap === 12) return q;
    const allowedMonths = Array.from({ length: monthCap }, (_, i) => i + 1);
    return qb.in(monthColumn, allowedMonths) as T;
  }
  return qb.in(monthColumn, meses) as T;
}
