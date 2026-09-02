import type { MonthFilter } from "@/lib/date-range";

export type UnidadKey = "repuestos" | "lubfiltros" | "servicios" | "equipos" | "alquiler";

export interface UnidadBudgetRow {
  id: string;
  anio: number;
  mes: number;
  sucursalId: string | null;
  monto: string | number | null;
  ventasCcv: string | number | null;
  ventasXibi: string | number | null;
  ventasEstrategicas: string | number | null;
}

export interface UnidadReceivableRow {
  id: string;
  cliente: string;
  monto: string | number | null;
  saldo: string | number | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  sucursalId: string | null;
}

export interface UnidadData {
  unit: { key: UnidadKey; id: string; nombre: string };
  presupuestos: UnidadBudgetRow[];
  presupuestosYtd: UnidadBudgetRow[];
  cobranzas: UnidadReceivableRow[];
  cotizado: { montoTotal: string | number | null; cantidad: number | string | null };
  detallesMarcas?: Array<Record<string, unknown>>;
  inventario?: Array<Record<string, unknown>>;
  servicios?: Array<Record<string, unknown>>;
  serviciosInterno?: Array<Record<string, unknown>>;
  detallesEstrategicos?: Array<Record<string, unknown>>;
  ventasPerdidas?: Array<Record<string, unknown>>;
}

export async function getUnidadData(
  key: UnidadKey,
  params: { anio: number; meses: MonthFilter; sucursalId?: string },
): Promise<UnidadData> {
  const search = new URLSearchParams({ anio: String(params.anio) });
  search.set("meses", params.meses === "all" ? "all" : params.meses.join(","));
  if (params.sucursalId && params.sucursalId !== "all") {
    search.set("sucursalId", params.sucursalId);
  }

  const response = await fetch(`/api/unidades/${key}?${search.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar los datos de la unidad.");
  }
  return (await response.json()) as UnidadData;
}