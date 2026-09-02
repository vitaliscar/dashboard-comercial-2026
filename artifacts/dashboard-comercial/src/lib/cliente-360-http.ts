export type Cliente360Fuente = "cotizado" | "facturado" | "perdido";
export type Cliente360Data = {
  pareto: Array<{ cliente: string; monto: string | number; sucursalId: string | null }>;
  facturas: Array<{ cliente: string; fecha: string; monto: string | number }>;
  ventasPerdidas: Array<{ cliente: string; monto: string | number }>;
  cobranzas: Array<{ cliente: string; saldo: string | number; fechaVencimiento: string }>;
};
export async function getCliente360(data: { fuente: Cliente360Fuente; anio: number; mes: number; unidades: string[]; sucursales: string[] }) {
  const query = new URLSearchParams({ fuente: data.fuente, anio: String(data.anio), mes: String(data.mes) });
  if (data.unidades.length) query.set("unidades", data.unidades.join(","));
  if (data.sucursales.length) query.set("sucursales", data.sucursales.join(","));
  const response = await fetch(`/api/cliente-360?${query}`, { credentials: "include" });
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "No se pudo cargar cliente 360."); }
  return response.json() as Promise<Cliente360Data>;
}