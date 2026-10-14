export type Cliente360Fuente = "cotizado" | "facturado" | "perdido";
export type Cliente360Data = {
  pareto: Array<{ cliente: string; monto: string | number; sucursalId: string | null }>;
  facturas: Array<{ cliente: string; fecha: string; monto: string | number }>;
  ventasPerdidas: Array<{ cliente: string; monto: string | number }>;
  cobranzas: Array<{ cliente: string; saldo: string | number; fechaVencimiento: string }>;
};
export type CarteraIntegralAsignacion = {
  codigoAsesor: string;
  asesor: string;
  sucursalId: string;
  sucursal: string;
};
export type CarteraIntegralCliente = {
  companiaCodigo: number;
  codigoCliente: string;
  cliente: string;
  asesoresAsignados: number;
  sucursalesAsignadas: number;
  asignaciones: CarteraIntegralAsignacion[];
};
export type CarteraIntegralData = {
  clientes: CarteraIntegralCliente[];
  total: number;
  asignaciones: number;
};
export type CarteraVentasData = {
  resumen: Array<{ tipo: "cartera" | "esporadico" | "sin_codigo"; monto: string | number; clientes: number }>;
  clientes: CarteraVentasCliente[];
  calidad: { ventasSinCodigoCliente: string | number; ventasSinCodigoAsesor: string | number };
};
export type CarteraVentasCliente = {
  codigoCliente: string;
  sucursalId: string;
  sucursal: string;
  cliente: string;
  monto: string | number;
  montoCartera?: string | number;
  montoEsporadico?: string | number;
  esCartera: boolean;
  ultimaVenta?: string | null;
  asesores?: Array<{ codigoAsesor: string | null; asesor: string | null }>;
  desgloseUnidad?: Array<{ unidad: string; monto: string | number }>;
};

export async function getCarteraVentas(data: { anio: number; meses: number[]; unidades: string[]; sucursales: string[] }) {
  const query = new URLSearchParams({ anio: String(data.anio) });
  if (data.meses.length) query.set("meses", data.meses.join(","));
  if (data.unidades.length) query.set("unidades", data.unidades.join(","));
  if (data.sucursales.length) query.set("sucursales", data.sucursales.join(","));
  const response = await fetch(`/api/cliente-360/cartera-ventas?${query}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo cargar el análisis de cartera y ventas.");
  }
  return response.json() as Promise<CarteraVentasData>;
}

export async function getCarteraIntegral(data: { q?: string; sucursales: string[] }) {
  const query = new URLSearchParams();
  if (data.q?.trim()) query.set("q", data.q.trim());
  if (data.sucursales.length) query.set("sucursales", data.sucursales.join(","));
  const response = await fetch(`/api/cliente-360/cartera-integral?${query}`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo cargar la cartera integral.");
  }
  return response.json() as Promise<CarteraIntegralData>;
}

export async function getCliente360(data: { fuente: Cliente360Fuente; anio: number; meses: number[]; unidades: string[]; sucursales: string[] }) {
  const query = new URLSearchParams({ fuente: data.fuente, anio: String(data.anio) });
  if (data.meses.length) query.set("meses", data.meses.join(","));
  if (data.unidades.length) query.set("unidades", data.unidades.join(","));
  if (data.sucursales.length) query.set("sucursales", data.sucursales.join(","));
  const response = await fetch(`/api/cliente-360?${query}`, { credentials: "include" });
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? "No se pudo cargar cliente 360."); }
  return response.json() as Promise<Cliente360Data>;
}
