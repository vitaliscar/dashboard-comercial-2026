export type MonthlyPoint = { mes: number; venta: number; presupuesto: number };
export type PerformanceScore = {
  score: number;
  cumplimiento: number;
  tendencia: number;
  ticket: number;
  banda: "success" | "warning" | "danger";
};

export type EvaluacionAsesor = {
  asesor: string; anio: number; puntos: MonthlyPoint[]; ticketPropio: number; ticketPromedioGrupo: number;
  cantidadPares: number; percentilVsPares: number; score: PerformanceScore;
};
export type EvaluacionSucursal = EvaluacionAsesor & { sucursal: string };
export type EvaluacionUnidad = {
  unidad: string; anio: number; puntos: MonthlyPoint[]; ticketPropio: number; score: PerformanceScore;
  desglosePorSucursal: Array<{ sucursal: string; venta: number; presupuesto: number; cumplimiento: number }>;
};

async function request<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && query.set(key, String(value)));
  const response = await fetch(`/api/evaluacion/${path}?${query}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo cargar la evaluación de desempeño.");
  }
  return response.json() as Promise<T>;
}

export const getEvaluacionAsesor = (anio: number) => request<EvaluacionAsesor>("asesor", { anio });
export const getEvaluacionSucursal = (anio: number, sucursalId?: string) =>
  request<EvaluacionSucursal>("sucursal", { anio, sucursalId });
export const getEvaluacionUnidad = (anio: number, unidadId: string) =>
  request<EvaluacionUnidad>("unidad", { anio, unidadId });