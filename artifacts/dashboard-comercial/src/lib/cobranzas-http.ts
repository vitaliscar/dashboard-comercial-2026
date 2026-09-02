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

async function request<T>(path: string, filters: CobranzasFilters): Promise<T> {
  const query = queryFor(filters);
  const response = await fetch(`/api/cobranzas${path}${query ? `?${query}` : ""}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar las cobranzas.");
  }
  return (await response.json()) as T;
}

export function getCobranzas(filters: CobranzasFilters) {
  return request<CobranzaRow[]>("", filters);
}

export function getCobranzasComparison(filters: CobranzasFilters) {
  return request<CobranzasComparison>("/comparison", filters);
}