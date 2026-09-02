import type { MonthFilter } from "@/lib/date-range";

export type PanelMetrics = {
  facturacion: { totalMonto: string | number; cantidad: number };
  perdidas: { totalMonto: string | number; cantidad: number };
  cotizaciones?: { cantidad: number };
  presupuestos: Array<{ mes: number; presupuesto?: string | number; monto?: string | number; pctParticipacion?: string | number }> | { totalMonto: string | number };
  scoreAsesor?: Array<{ mes: number; presupuesto: string | number; pctParticipacion: string | number }>;
  minutas?: Array<{ estado: string; fechaLimite: string | null; cantidad: number }>;
};

function query(filters: { anio: number; meses: MonthFilter; unidades: string[]; sucursales?: string[] }) {
  const result = new URLSearchParams({ anio: String(filters.anio), meses: filters.meses === "all" ? "all" : filters.meses.join(",") });
  if (filters.unidades.length) result.set("unidadIds", filters.unidades.join(","));
  if (filters.sucursales?.length) result.set("sucursalIds", filters.sucursales.join(","));
  return result;
}

async function request<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`/api${path}?${params}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo cargar el panel.");
  }
  return response.json() as Promise<T>;
}

export function getSucursalMetrics(filters: Parameters<typeof query>[0]) {
  return request<PanelMetrics>("/sucursal/metrics", query(filters));
}

export function getSucursalTrend(filters: Parameters<typeof query>[0]) {
  return request<{ facturas: Array<{ mes: number; monto: string | number }>; presupuestos: Array<{ mes: number; monto: string | number }> }>("/sucursal/trend", query(filters));
}

export function getAsesorMetrics(filters: Parameters<typeof query>[0]) {
  return request<PanelMetrics>("/asesor/metrics", query(filters));
}

export function getAsesorTrend(filters: Parameters<typeof query>[0]) {
  return request<{ facturas: Array<{ mes: number; monto: string | number }>; presupuestos: Array<{ mes: number; presupuesto: string | number }> }>("/asesor/trend", query(filters));
}

export function getCoordinadorYear(filters: Parameters<typeof query>[0]) {
  return request<{ presupuestos: Array<{ mes: number; unidadNegocioId: string; monto: string | number; ventasCcv: string | number; ventasXibi: string | number; ventasEstrategicas: string | number }> }>("/coordinador/year", query(filters));
}