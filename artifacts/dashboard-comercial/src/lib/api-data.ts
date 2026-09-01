import {
  getCatalogos,
  getResumen,
  type GetResumenParams,
} from "@workspace/api-client-react";

export interface CatalogBranch {
  id: string;
  nombre: string;
  ciudad?: string | null;
}

export interface CatalogUnit {
  id: string;
  nombre: string;
  descripcion?: string | null;
}

export interface CatalogosData {
  sucursales: CatalogBranch[];
  unidades: CatalogUnit[];
}

interface UnidadRow {
  unidadNegocioId: string | null;
  montoTotal: string | number | null;
  cantidad?: string | number | null;
}

interface ClienteRow extends UnidadRow {
  sucursalId: string | null;
  cliente: string;
}

interface MensualRow extends UnidadRow {
  mes: number;
}

interface RazonRow extends UnidadRow {
  razon: string;
}

interface PresupuestoRow {
  unidadNegocioId: string | null;
  monto?: string | number | null;
  ventasCcv?: string | number | null;
  ventasXibi?: string | number | null;
  ventasEstrategicas?: string | number | null;
}

interface CumplimientoRow {
  unidadNegocioId: string | null;
  presupuesto: string | number | null;
  venta: string | number | null;
  mes: number;
}

export interface ResumenApiData {
  cotizaciones: UnidadRow[];
  cotizacionesPrevMonth: UnidadRow[];
  cotizacionesMensual: MensualRow[];
  cotizacionesClientes: ClienteRow[];
  facturas: UnidadRow[];
  facturasClientes: ClienteRow[];
  ventasPerdidas: UnidadRow[];
  ventasPerdidasPrevMonth: UnidadRow[];
  ventasPerdidasClientes: ClienteRow[];
  ventasPerdidasRazones: RazonRow[];
  servicios: UnidadRow[];
  presupuestos: PresupuestoRow[];
  cumplimientoAsesor: CumplimientoRow[];
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    : [];
}

function asList<T>(value: unknown): T[] {
  return asRows(value) as unknown as T[];
}

export async function getCatalogosData(): Promise<CatalogosData> {
  const payload = (await getCatalogos()) as Record<string, unknown>;
  return {
    sucursales: asList<CatalogBranch>(payload.sucursales),
    unidades: asList<CatalogUnit>(payload.unidades),
  };
}

export async function getResumenData(params: GetResumenParams): Promise<ResumenApiData> {
  const payload = (await getResumen(params)) as Record<string, unknown>;
  return {
    cotizaciones: asList<UnidadRow>(payload.cotizaciones),
    cotizacionesPrevMonth: asList<UnidadRow>(payload.cotizacionesPrevMonth),
    cotizacionesMensual: asList<MensualRow>(payload.cotizacionesMensual),
    cotizacionesClientes: asList<ClienteRow>(payload.cotizacionesClientes),
    facturas: asList<UnidadRow>(payload.facturas),
    facturasClientes: asList<ClienteRow>(payload.facturasClientes),
    ventasPerdidas: asList<UnidadRow>(payload.ventasPerdidas),
    ventasPerdidasPrevMonth: asList<UnidadRow>(payload.ventasPerdidasPrevMonth),
    ventasPerdidasClientes: asList<ClienteRow>(payload.ventasPerdidasClientes),
    ventasPerdidasRazones: asList<RazonRow>(payload.ventasPerdidasRazones),
    servicios: asList<UnidadRow>(payload.servicios),
    presupuestos: asList<PresupuestoRow>(payload.presupuestos),
    cumplimientoAsesor: asList<CumplimientoRow>(payload.cumplimientoAsesor),
  };
}