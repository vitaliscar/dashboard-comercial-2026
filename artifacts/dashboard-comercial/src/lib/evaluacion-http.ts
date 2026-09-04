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

// ── Reporte unificado (v2) ──────────────────────────────────────────────────
export type Hallazgo = { tipo: "good" | "bad" | "warn"; titulo: string; texto: string };
export type MarcaMonto = { marca: string; monto: number };
export type ReporteFiltros = { anio: number; meses: number[]; sucursalIds: string[]; unidadNegocioIds: string[] };

export type ReporteSucursal = {
  tipo: "sucursal";
  anio: number;
  meses: number[];
  cumplimientoGeneral: number;
  totalVenta: number;
  totalMeta: number;
  ranking: Array<{ id: string; label: string; meta: number; facturado: number; pct: number }>;
  heatmap: Array<{ sucursal: string; celdas: Array<{ mes: number; pct: number | null }> }>;
  hallazgos: Hallazgo[];
  detalleMarca: { repuestos: MarcaMonto[]; lubfiltros: MarcaMonto[]; equipos: MarcaMonto[] } | null;
  composicionCompania: { ccv: number; xibi: number; estrategicas: number };
};
export type ReporteAsesorPropio = {
  tipo: "asesor";
  anio: number;
  meses: number[];
  cumplimientoGeneral: number;
  totalVenta: number;
  totalMeta: number;
  puntos: MonthlyPoint[];
  hallazgos: Hallazgo[];
};
export type Reporte = ReporteSucursal | ReporteAsesorPropio;

function csv(values: string[] | number[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}

export const getReporteEvaluacion = (filtros: ReporteFiltros) =>
  request<Reporte>("reporte", {
    anio: filtros.anio,
    meses: csv(filtros.meses),
    sucursalIds: csv(filtros.sucursalIds),
    unidadNegocioIds: csv(filtros.unidadNegocioIds),
  });

export type GestionAsesorFila = {
  codigoAsesor: string; asesor: string; cotizado: number; clientesCotizados: number; facturado: number;
  presupuesto: number; perdido: number; clientesPerdidos: number; tasaConversion: number; tasaPerdida: number;
  cumplimiento: number; scorePonderado: number;
};
export type GestionAsesores = { anio: number; meses: number[]; filas: GestionAsesorFila[] };

export const getGestionAsesores = (filtros: ReporteFiltros) =>
  request<GestionAsesores>("gestion-asesores", {
    anio: filtros.anio,
    meses: csv(filtros.meses),
    unidadNegocioIds: csv(filtros.unidadNegocioIds),
  });

export const getAnalisisNarrativo = (resumen: {
  anio: number;
  meses: number[];
  cumplimientoGeneral: number;
  totalVenta: number;
  totalMeta: number;
  ranking?: Array<{ label: string; meta: number; facturado: number; pct: number }>;
  hallazgos: Hallazgo[];
}) =>
  request<{ texto: string }>("analisis-narrativo", {
    anio: resumen.anio,
    meses: csv(resumen.meses),
    cumplimientoGeneral: resumen.cumplimientoGeneral,
    totalVenta: resumen.totalVenta,
    totalMeta: resumen.totalMeta,
    ranking: resumen.ranking ? JSON.stringify(resumen.ranking) : undefined,
    hallazgos: JSON.stringify(resumen.hallazgos.map((h) => h.texto)),
  }).then((r) => r.texto);