export interface CobranzaRow {
  id: string;
  cliente: string;
  facturaNumero: string | null;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: string | number;
  saldo: string | number;
  diasVencidos: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  createdAt: string;
  sucursal: string | null;
  unidadNegocio: string | null;
}

export interface CobranzasComparison {
  tieneHistorico: boolean;
  totalVencidoActual: number;
  totalVencidoAnterior: number;
  deltaVencido: number;
  clientesEmpeoraron: Array<{
    cliente: string;
    saldoActual: number;
    saldoAnterior: number;
    delta: number;
  }>;
}

type CobranzasFilters = { selectedUnidades: string[]; selectedSucursales: string[] };

function queryFor(filters: CobranzasFilters) {
  const search = new URLSearchParams();
  if (filters.selectedUnidades.length) search.set("unidades", filters.selectedUnidades.join(","));
  if (filters.selectedSucursales.length) search.set("sucursales", filters.selectedSucursales.join(","));
  return search.toString();
}

async function request<T>(path: string, filters: CobranzasFilters, options?: { search?: string; page?: number }): Promise<T> {
  const params = new URLSearchParams(queryFor(filters));
  if (options?.search) params.set("q", options.search);
  if (options?.page !== undefined) params.set("page", String(options.page));
  const query = params.toString();
  const response = await fetch(`/api/cobranzas${path}${query ? `?${query}` : ""}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar las cobranzas.");
  }
  return (await response.json()) as T;
}

export function getCobranzas(filters: CobranzasFilters, options: { search: string; page: number }) {
  return request<CobranzasPage>("", filters, options);
}

export function getCobranzasComparison(filters: CobranzasFilters) {
  return request<CobranzasComparison>("/comparison", filters);
}

export interface CobranzasPage {
  items: CobranzaRow[];
  total: number;
  summary: {
    count: number;
    totals: Record<string, number>;
    byBranch: Array<{ nombre: string; total: number }>;
    byUnit: Array<{ nombre: string; total: number }>;
  };
}
