import { and, gte, lt, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DateRange } from "@/lib/date-range";

/**
 * Drizzle equivalent of applyDateRangesToQuery — AND(gte,lt) per range, OR'd together.
 * Rango vacío = sin datos (nunca "sin filtro"): evita devolver el histórico completo
 * cuando el filtro de meses queda vacío o el año futuro no tiene YTD.
 */
export function dateRangeCondition(column: SQLWrapper, ranges: DateRange[]): SQL {
  if (ranges.length === 0) return sql`false`;
  const clauses = ranges.map((r) => and(gte(column, r.from), lt(column, r.to))!);
  return ranges.length === 1 ? clauses[0]! : or(...clauses)!;
}
