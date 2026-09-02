import type { MonthFilter } from "@/lib/date-range";

export interface AsesoresRawData {
  cotizaciones: Array<Record<string, any>>;
  perdidas: Array<Record<string, any>>;
  cumplimiento: Array<Record<string, any>>;
  ventasCasa: Array<Record<string, any>>;
}

export interface AsesoresDrilldownData {
  aliases: Array<Record<string, any>>;
  metas: Array<Record<string, any>>;
  facturas: Array<Record<string, any>>;
  cotizaciones: Array<Record<string, any>>;
  perdidas: Array<Record<string, any>>;
}

async function request<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`/api/asesores?${params.toString()}`, { credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar los datos de asesores.");
  }
  return (await response.json()) as T;
}

function filters(params: { anio: number; sucursales?: string[]; unidades?: string[] }) {
  const search = new URLSearchParams({ anio: String(params.anio) });
  if (params.sucursales?.length) search.set("sucursalIds", params.sucursales.join(","));
  if (params.unidades?.length) search.set("unidadIds", params.unidades.join(","));
  return search;
}

export function getAsesoresRawData(params: {
  anio: number;
  meses: MonthFilter;
  selectedSucursales: string[];
  selectedUnidades: string[];
}) {
  // The legacy action intentionally used only the first selected branch.
  const search = filters({ anio: params.anio, sucursales: params.selectedSucursales.slice(0, 1), unidades: params.selectedUnidades });
  search.set("meses", params.meses === "all" ? "all" : params.meses.join(","));
  return request<AsesoresRawData>(search);
}

export function getAsesoresDrilldown(params: { anio: number }) {
  const search = filters({ anio: params.anio });
  search.set("drilldown", "true");
  return request<AsesoresDrilldownData>(search);
}