import {
  AsesorCanonico,
  resolverAsesor,
  VENTAS_CASA,
  ASESORES_CANONICOS,
} from "../asesores-catalogo";

export interface AgrupacionAsesor {
  codigo: string;
  nombre: string;
  sucursal: string;
  venta: number;
  meta: number;
  cotizado: number;
  perdido: number;
  nCotizaciones: number;
  nPerdidas: number;
  cumplimiento: number;
  conversion: number;
  participacion: number;
}

export interface KPIAsesores {
  totalFacturadoAsesores: number;
  totalFacturadoVentasCasa: number;
  totalPerdido: number;
  cumplimientoPromedio: number;
  asesoresSobreMeta: number;
  totalAsesoresConMeta: number;
}

/**
 * Agrupa y consolida todos los datos transaccionales y de presupuesto por asesor canónico.
 * Todo lo que no coincida con el catálogo de 32 asesores se acumula en "Ventas Casa".
 *
 * La venta y la meta de cada asesor vienen de `cumplimiento_asesores` (hoja
 * Excel CumplimientoAsesoresBase), ya reconciliada por código de asesor —
 * no de `facturas`, que es transaccional y sin reconciliar. Las ventas de
 * atención casa (hoja Excel "Ventas Casa": por sucursal/U-N/mes, sin asesor
 * asociado) se suman directo al bucket de Ventas Casa.
 */
export function consolidarAsesores(
  cumplimiento: {
    codigo_asesor?: string | number | null;
    asesor?: string | null;
    venta?: number | null;
    presupuesto?: number | null;
  }[],
  cotizaciones: {
    asesor_codigo?: string | number | null;
    cliente?: string | null;
    monto?: number | null;
    cantidad?: number | null;
  }[],
  perdidas: {
    asesor?: string | null;
    cliente?: string | null;
    monto?: number | null;
    cantidad?: number | null;
  }[],
  ventasCasaSucursal: {
    monto?: number | null;
  }[],
  aliases?: Map<string, string>,
): AgrupacionAsesor[] {
  const map = new Map<string, AgrupacionAsesor>();

  // Inicializar todos los asesores canónicos
  ASESORES_CANONICOS.forEach((a) => {
    map.set(a.codigo, {
      codigo: a.codigo,
      nombre: a.nombre,
      sucursal: a.sucursal,
      venta: 0,
      meta: 0,
      cotizado: 0,
      perdido: 0,
      nCotizaciones: 0,
      nPerdidas: 0,
      cumplimiento: 0,
      conversion: 0,
      participacion: 0,
    });
  });

  // Inicializar Ventas Casa
  map.set(VENTAS_CASA.codigo, {
    codigo: VENTAS_CASA.codigo,
    nombre: VENTAS_CASA.nombre,
    sucursal: VENTAS_CASA.sucursal,
    venta: 0,
    meta: 0,
    cotizado: 0,
    perdido: 0,
    nCotizaciones: 0,
    nPerdidas: 0,
    cumplimiento: 0,
    conversion: 0,
    participacion: 0,
  });

  // 1. Acumular Venta y Meta (cumplimiento_asesores, ya reconciliado por código)
  cumplimiento.forEach((m) => {
    const resolved = resolverAsesor({ codigo: m.codigo_asesor, nombre: m.asesor }, aliases);
    const item = map.get(resolved.codigo)!;
    item.venta += Number(m.venta || 0);
    item.meta += Number(m.presupuesto || 0);
  });

  // 2. Acumular Cotizaciones
  cotizaciones.forEach((c) => {
    const resolved = resolverAsesor({ codigo: c.asesor_codigo, cliente: c.cliente }, aliases);
    const item = map.get(resolved.codigo)!;
    item.cotizado += Number(c.monto || 0);
    item.nCotizaciones += c.cantidad != null ? Number(c.cantidad) : 1;
  });

  // 3. Acumular Ventas Perdidas
  perdidas.forEach((p) => {
    const resolved = resolverAsesor({ nombre: p.asesor, cliente: p.cliente }, aliases);
    const item = map.get(resolved.codigo)!;
    item.perdido += Number(p.monto || 0);
    item.nPerdidas += p.cantidad != null ? Number(p.cantidad) : 1;
  });

  // 4. Ventas Casa por sucursal (sin asesor asociado) — directo al bucket Ventas Casa
  const casaItem = map.get(VENTAS_CASA.codigo)!;
  ventasCasaSucursal.forEach((v) => {
    casaItem.venta += Number(v.monto || 0);
  });

  const result = Array.from(map.values());

  // 5. Calcular métricas derivadas y porcentajes
  const totalVentaGeneral = result.reduce((sum, item) => sum + item.venta, 0);

  result.forEach((item) => {
    item.cumplimiento = item.meta > 0 ? (item.venta / item.meta) * 100 : 0;
    item.conversion = item.cotizado > 0 ? (item.venta / item.cotizado) * 100 : 0;
    item.participacion = totalVentaGeneral > 0 ? (item.venta / totalVentaGeneral) * 100 : 0;
  });

  return result;
}

/**
 * Calcula los indicadores agregados clave para la vista general de asesores.
 */
export function calcularKPIs(agrupados: AgrupacionAsesor[]): KPIAsesores {
  let totalFacturadoAsesores = 0;
  let totalFacturadoVentasCasa = 0;
  let totalPerdido = 0;
  let asesoresSobreMeta = 0;
  let totalAsesoresConMeta = 0;
  let sumaVentaAsesoresConMeta = 0;
  let sumaMetaAsesoresConMeta = 0;

  agrupados.forEach((item) => {
    if (item.codigo === VENTAS_CASA.codigo) {
      totalFacturadoVentasCasa += item.venta;
    } else {
      totalFacturadoAsesores += item.venta;
    }
    totalPerdido += item.perdido;

    if (item.meta > 0 && item.codigo !== VENTAS_CASA.codigo) {
      totalAsesoresConMeta++;
      sumaVentaAsesoresConMeta += item.venta;
      sumaMetaAsesoresConMeta += item.meta;
      if (item.venta >= item.meta) {
        asesoresSobreMeta++;
      }
    }
  });

  const cumplimientoPromedio =
    sumaMetaAsesoresConMeta > 0 ? (sumaVentaAsesoresConMeta / sumaMetaAsesoresConMeta) * 100 : 0;

  return {
    totalFacturadoAsesores,
    totalFacturadoVentasCasa,
    totalPerdido,
    cumplimientoPromedio,
    asesoresSobreMeta,
    totalAsesoresConMeta,
  };
}

