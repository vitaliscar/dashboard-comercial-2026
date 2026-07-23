import { and, gte, lt, or, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DateRange } from "@/lib/date-range";

/** Drizzle equivalent of applyDateRangesToQuery — AND(gte,lt) per range, OR'd together. */
export function dateRangeCondition(column: SQLWrapper, ranges: DateRange[]): SQL | undefined {
  if (ranges.length === 0) return undefined;
  const clauses = ranges.map((r) => and(gte(column, r.from), lt(column, r.to))!);
  return ranges.length === 1 ? clauses[0] : or(...clauses);
}
