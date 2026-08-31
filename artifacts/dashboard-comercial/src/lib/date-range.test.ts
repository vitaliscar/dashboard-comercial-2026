import { describe, it, expect } from "vitest";
import {
  getAllMonthsCap,
  getDateRangesForMonths,
  applyDateRangesToQuery,
  applyMonthFilterToQuery,
} from "./date-range";

describe("getAllMonthsCap", () => {
  it("should cap to 12 for past years", () => {
    const now = new Date(2026, 6, 15); // July 2026
    expect(getAllMonthsCap(2025, now)).toBe(12);
  });

  it("should cap to current month for the current year", () => {
    const now = new Date(2026, 6, 15); // July 2026 (index 6 = July)
    expect(getAllMonthsCap(2026, now)).toBe(7);
  });

  it("should return 0 for future years", () => {
    const now = new Date(2026, 6, 15);
    expect(getAllMonthsCap(2027, now)).toBe(0);
  });
});

describe("getDateRangesForMonths", () => {
  it("should return single range for YTD 'all'", () => {
    const now = new Date(2026, 4, 10); // May 2026
    const ranges = getDateRangesForMonths(2026, "all", now);
    expect(ranges).toEqual([{ from: "2026-01-01", to: "2026-06-01" }]);
  });

  it("should return empty array for future year YTD", () => {
    const now = new Date(2026, 4, 10);
    const ranges = getDateRangesForMonths(2027, "all", now);
    expect(ranges).toEqual([]);
  });

  it("should group contiguous months into single ranges", () => {
    const ranges = getDateRangesForMonths(2026, [1, 2, 3]);
    expect(ranges).toEqual([{ from: "2026-01-01", to: "2026-04-01" }]);
  });

  it("should return multiple ranges for non-contiguous months", () => {
    const ranges = getDateRangesForMonths(2026, [1, 3, 5]);
    expect(ranges).toEqual([
      { from: "2026-01-01", to: "2026-02-01" },
      { from: "2026-03-01", to: "2026-04-01" },
      { from: "2026-05-01", to: "2026-06-01" },
    ]);
  });

  it("should handle mixed contiguous and non-contiguous months", () => {
    const ranges = getDateRangesForMonths(2026, [1, 2, 4, 5, 8]);
    expect(ranges).toEqual([
      { from: "2026-01-01", to: "2026-03-01" },
      { from: "2026-04-01", to: "2026-06-01" },
      { from: "2026-08-01", to: "2026-09-01" },
    ]);
  });
});

describe("applyDateRangesToQuery", () => {
  it("should apply gte/lt for single range", () => {
    const calls: Array<Record<string, unknown>> = [];
    const mockQuery = {
      gte: (c: string, v: string) => {
        calls.push({ method: "gte", col: c, val: v });
        return mockQuery;
      },
      lt: (c: string, v: string) => {
        calls.push({ method: "lt", col: c, val: v });
        return mockQuery;
      },
    };

    applyDateRangesToQuery(mockQuery, [{ from: "2026-01-01", to: "2026-04-01" }]);
    expect(calls).toEqual([
      { method: "gte", col: "fecha", val: "2026-01-01" },
      { method: "lt", col: "fecha", val: "2026-04-01" },
    ]);
  });

  it("should apply OR condition for multiple ranges", () => {
    const calls: Array<Record<string, unknown>> = [];
    const mockQuery = {
      or: (condition: string) => {
        calls.push({ method: "or", val: condition });
        return mockQuery;
      },
    };

    applyDateRangesToQuery(mockQuery, [
      { from: "2026-01-01", to: "2026-02-01" },
      { from: "2026-04-01", to: "2026-05-01" },
    ]);
    expect(calls).toEqual([
      {
        method: "or",
        val: "and(fecha.gte.2026-01-01,fecha.lt.2026-02-01),and(fecha.gte.2026-04-01,fecha.lt.2026-05-01)",
      },
    ]);
  });
});

describe("applyMonthFilterToQuery", () => {
  it("should apply in check for list of months", () => {
    const calls: Array<Record<string, unknown>> = [];
    const mockQuery = {
      in: (c: string, v: number[]) => {
        calls.push({ col: c, val: v });
        return mockQuery;
      },
    };

    applyMonthFilterToQuery(mockQuery, [1, 3], 2026);
    expect(calls).toEqual([{ col: "mes", val: [1, 3] }]);
  });
});
