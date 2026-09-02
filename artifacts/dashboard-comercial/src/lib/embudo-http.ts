export type EmbudoData = {
  cotizaciones: Array<{ id: string; unidadNegocioId: string | null; monto: string | number; fecha: string; etapa: string }>;
  presupuestos: Array<{ id: string; mes: number; unidadNegocioId: string | null; ventasCcv: string | number; ventasXibi: string | number; ventasEstrategicas: string | number }>;
  totales: { cotizado: number; facturado: number; cobrado: number };
};
export async function getEmbudo(data: { anio: number; meses: number[]; unidades: string[]; sucursales: string[] }) {
  const query = new URLSearchParams({ anio: String(data.anio) });
  if (data.meses.length) query.set("meses", data.meses.join(","));
  if (data.unidades.length) query.set("unidades", data.unidades.join(","));
  if (data.sucursales.length) query.set("sucursales", data.sucursales.join(","));
  const response = await fetch(`/api/embudo?${query}`, { credentials: "include" });
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "No se pudo cargar el embudo."); }
  return response.json() as Promise<EmbudoData>;
}