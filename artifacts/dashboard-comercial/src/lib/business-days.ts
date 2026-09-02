import type { MonthFilter } from "@/lib/date-range";

export type ProjectionTone = "success" | "warning" | "danger";

export interface MonthlySalesProjection {
  projectedSales: number;
  elapsedBusinessDays: number;
  totalBusinessDays: number;
  tone: ProjectionTone;
}

function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/** Cuenta días hábiles entre dos fechas, incluyendo ambos extremos. */
export function countBusinessDays(from: Date, to: Date): number {
  const start = atLocalMidnight(from);
  const end = atLocalMidnight(to);
  if (start > end) return 0;

  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

export function countBusinessDaysInMonth(anio: number, mes: number): number {
  return countBusinessDays(new Date(anio, mes - 1, 1), new Date(anio, mes, 0));
}

function getProjectionTone(projectedSales: number, meta: number): ProjectionTone {
  if (meta <= 0 || projectedSales >= meta) return "success";
  return projectedSales >= meta * 0.7 ? "warning" : "danger";
}

/**
 * Proyecta el cierre del mes usando el ritmo acumulado por días hábiles.
 * Solo devuelve resultado para un único mes del año y mes actuales.
 */
export function getMonthlySalesProjection(
  accumulatedSales: number,
  meta: number,
  anio: number,
  meses: MonthFilter,
  now = new Date(),
): MonthlySalesProjection | null {
  if (meses === "all" || meses.length !== 1) return null;

  const mes = meses[0];
  if (anio !== now.getFullYear() || mes !== now.getMonth() + 1) return null;

  const elapsedBusinessDays = countBusinessDays(
    new Date(anio, mes - 1, 1),
    now,
  );
  const totalBusinessDays = countBusinessDaysInMonth(anio, mes);
  if (elapsedBusinessDays <= 0 || totalBusinessDays <= 0) return null;

  const projectedSales = (accumulatedSales / elapsedBusinessDays) * totalBusinessDays;
  return {
    projectedSales,
    elapsedBusinessDays,
    totalBusinessDays,
    tone: getProjectionTone(projectedSales, meta),
  };
}