export type MonthFilter = number[] | "all";

export interface DateRange {
  from: string;
  to: string;
}

export function getAllMonthsCap(anio: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (anio < currentYear) return 12;
  if (anio === currentYear) return currentMonth;
  return 0;
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
