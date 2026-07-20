/**
 * Tipos compartidos para el módulo Resumen
 */

export type UnidadNegocio = "Servicios" | "Repuestos" | "Lub / Filtros" | "Alquiler" | "Equipos";

export interface TopCliente {
  [key: string]: unknown;
  sucursal: string;
  cliente: string;
  monto: number;
  porcentaje?: number;
}

export interface TopRazon {
  razon: string;
  monto: number;
  cantidad: number;
}

export interface UnidadMetrica {
  unidad: UnidadNegocio;
  monto: number;
  porcentaje: number;
  topClientes: TopCliente[];
}

export interface KpiMetrica {
  label: string;
  valor: number;
  porcentaje?: number;
  formato?: "currency" | "percentage";
}

export interface FacturadoMetrica extends UnidadMetrica {
  cumplimiento: number;
  margenEstimado: number;
  margenMonto: number;
  tiposCliente?: ("TODAS" | "CCV" | "XIB" | "EST")[];
  presupuestoTotal?: number;
  ventasCCV?: number;
  ventasXibi?: number;
  ventasEstrategicas?: number;
}

export interface VentasPerdidaMetrica extends UnidadMetrica {
  topRazones: TopRazon[];
}

export interface ResumenData {
  periodo: {
    mes: number[] | "all";
    anio: number;
    sucursal?: string;
  };
  kpis: {
    cotizado: number;
    metaMes: number;
    facturado: number;
    facturadoVsCotizadoPorcentaje: number;
    cumplimientoMetaPorcentaje: number;
    margenTotal: number;
    margenPorcentaje: number;
    ventasPerdidas: number;
    ventasPerdidasPorcentaje: number;
  };
  cotizaciones: UnidadMetrica[];
  facturado: FacturadoMetrica[];
  ventasPerdidas: VentasPerdidaMetrica[];
}
