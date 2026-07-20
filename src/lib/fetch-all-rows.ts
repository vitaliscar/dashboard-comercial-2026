const PAGE_SIZE = 1000;

interface RangedQuery<T> {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/**
 * Supabase/PostgREST caps responses at 1000 rows by default (returns 206 Partial
 * Content past that). Any query over a wide date range (cotizaciones, facturas,
 * ventas_perdidas) can silently exceed it, undercounting totals. This loops
 * `.range()` pages until a page comes back short of PAGE_SIZE.
 */
export async function fetchAllRows<T>(buildQuery: () => RangedQuery<T>): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
