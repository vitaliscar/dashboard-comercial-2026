/**
 * Funnel comercial: cruce de cotizado → facturado → perdido → cobrado.
 *
 * Respeta el neteo de repuestos ya aplicado en el parser de Excel
 * (`getCotizacionesPrincipales` y `getFacturasPrincipales`): los montos
 * de `cotizaciones` y `facturas` que llegan a esta función ya son netos
 * (lubricante restado). Esta función solo agrupa y cruza.
 */

export interface FunnelInputCotizacion {
  cliente: string;
  asesor_codigo: string | null;
  monto: number;
}

export interface FunnelInputFactura {
  cliente: string;
  asesor: string;
  monto: number;
}

export interface FunnelInputVentaPerdida {
  cliente: string;
  asesor: string;
  monto: number;
}

export interface FunnelInputCobranza {
  cliente: string;
  monto: number;
  saldo: number;
}

export interface FunnelRow {
  key: string;
  cotizado: number;
  facturado: number;
  perdido: number;
  cobrado: number;
  tasaConversion: number;
  tasaPerdida: number;
  tasaCobro: number;
}

export interface FunnelSummary {
  rows: FunnelRow[];
  totales: {
    cotizado: number;
    facturado: number;
    perdido: number;
    cobrado: number;
  };
  conversionGlobal: number;
  perdidaGlobal: number;
  cobroGlobal: number;
}

export type FunnelDimension = "cliente" | "asesor";

/**
 * Normaliza un nombre de cliente o asesor para match exacto case-insensitive.
 * Quita acentos, espacios extra y pone en minúsculas.
 */
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Calcula el total del embudo (3 números) usando las fuentes de verdad correctas:
 * - cotizado: suma de cotizaciones.monto (neto Lub/Filtros ya restado en parser)
 * - facturado: suma de presupuestos (ventas_ccv + ventas_xibi + ventas_estrategicas)
 *   — igual que resumen.tsx, NO la tabla facturas
 * - cobrado: facturado − saldo total de cobranzas
 *
 * Esta función es para el KPI total del embudo. Para desglose por cliente/asesor
 * usar `computeFunnel()` pasando facturas (que sí tiene columna cliente).
 */
export function computeFunnelTotals(params: {
  totalCotizado: number;
  totalFacturadoPresupuestos: number; // de presupuestos: ventas_ccv + xibi + estrategicas
  totalSaldoCobranzas: number; // suma de cobranzas.saldo
}): {
  cotizado: number;
  facturado: number;
  cobrado: number;
  tasaConversion: number;
  tasaCobro: number;
} {
  const { totalCotizado, totalFacturadoPresupuestos, totalSaldoCobranzas } = params;
  const cobrado = Math.max(0, totalFacturadoPresupuestos - totalSaldoCobranzas);
  const tasaConversion = totalCotizado > 0 ? (totalFacturadoPresupuestos / totalCotizado) * 100 : 0;
  const tasaCobro =
    totalFacturadoPresupuestos > 0 ? (cobrado / totalFacturadoPresupuestos) * 100 : 100;
  return {
    cotizado: Math.round(totalCotizado * 100) / 100,
    facturado: Math.round(totalFacturadoPresupuestos * 100) / 100,
    cobrado: Math.round(cobrado * 100) / 100,
    tasaConversion: Math.round(tasaConversion * 100) / 100,
    tasaCobro: Math.round(tasaCobro * 100) / 100,
  };
}

/**
 * Calcula el embudo comercial agrupando por cliente o asesor.
 *
 * Match entre fuentes:
 * - dim "cliente": match por `cliente` (TEXT normalizado).
 * - dim "asesor": para cotizaciones usa `asesor_codigo` (no tiene `asesor` TEXT),
 *   para facturas y ventas_perdidas usa `asesor` (TEXT).
 *   El caller debe pasar un mapa opcional `asesorCodigoToNombre` para resolver
 *   el codigo de cotizaciones al nombre y poder cruzar con facturas/ventas_perdidas.
 *
 * Tasas:
 * - tasaConversion = facturado / cotizado * 100  (0 si cotizado = 0)
 * - tasaPerdida    = perdido / cotizado * 100     (0 si cotizado = 0)
 * - tasaCobro      = cobrado / facturado * 100    (100% si facturado = 0)
 *
 * El "cobrado" se estima como `facturado − saldo` usando el estado actual de
 * cobranzas (sin histórico). Si un cliente no tiene cobranzas, se asume 100% cobrado.
 *
 * Nota sobre fuentes de datos:
 * - Para el KPI TOTAL del embudo usar `computeFunnelTotals()` con datos de
 *   `presupuestos` (fuente de verdad para facturado, igual que resumen.tsx).
 * - Para desglose por CLIENTE usar esta función pasando `facturas` (que sí
 *   tiene columna `cliente`). `presupuestos` no tiene cliente.
 */
export function computeFunnel(
  cotizaciones: FunnelInputCotizacion[],
  facturas: FunnelInputFactura[],
  ventasPerdidas: FunnelInputVentaPerdida[],
  cobranzas: FunnelInputCobranza[],
  dim: FunnelDimension,
  asesorCodigoToNombre?: Map<string, string>,
): FunnelSummary {
  const map = new Map<
    string,
    { cotizado: number; facturado: number; perdido: number; cobrado: number }
  >();

  function upsert(key: string) {
    const k = normalize(key);
    if (!k) return null;
    let entry = map.get(k);
    if (!entry) {
      entry = { cotizado: 0, facturado: 0, perdido: 0, cobrado: 0 };
      map.set(k, entry);
    }
    return entry;
  }

  function keyForCotizacion(c: FunnelInputCotizacion): string | null {
    if (dim === "cliente") return c.cliente;
    const codigo = normalize(c.asesor_codigo);
    if (!codigo) return null;
    if (asesorCodigoToNombre && asesorCodigoToNombre.has(codigo)) {
      return asesorCodigoToNombre.get(codigo)!;
    }
    return codigo;
  }

  function keyForFactura(f: FunnelInputFactura): string | null {
    return dim === "cliente" ? f.cliente : f.asesor;
  }

  function keyForPerdida(p: FunnelInputVentaPerdida): string | null {
    return dim === "cliente" ? p.cliente : p.asesor;
  }

  for (const c of cotizaciones) {
    const key = keyForCotizacion(c);
    if (!key) continue;
    const entry = upsert(key);
    if (entry) entry.cotizado += Number(c.monto) || 0;
  }

  for (const f of facturas) {
    const key = keyForFactura(f);
    if (!key) continue;
    const entry = upsert(key);
    if (entry) entry.facturado += Number(f.monto) || 0;
  }

  for (const p of ventasPerdidas) {
    const key = keyForPerdida(p);
    if (!key) continue;
    const entry = upsert(key);
    if (entry) entry.perdido += Number(p.monto) || 0;
  }

  const cobranzaPorKey = new Map<string, { monto: number; saldo: number }>();
  for (const cob of cobranzas) {
    const key = normalize(cob.cliente);
    if (!key) continue;
    if (dim !== "cliente") continue;
    const agg = cobranzaPorKey.get(key) ?? { monto: 0, saldo: 0 };
    agg.monto += Number(cob.monto) || 0;
    agg.saldo += Number(cob.saldo) || 0;
    cobranzaPorKey.set(key, agg);
  }

  for (const [key, entry] of map.entries()) {
    if (dim === "cliente") {
      const cob = cobranzaPorKey.get(key);
      entry.cobrado = cob ? Math.max(0, cob.monto - cob.saldo) : entry.facturado;
    } else {
      entry.cobrado = entry.facturado;
    }
  }

  const rows: FunnelRow[] = Array.from(map.entries()).map(([key, v]) => {
    const tasaConversion = v.cotizado > 0 ? (v.facturado / v.cotizado) * 100 : 0;
    const tasaPerdida = v.cotizado > 0 ? (v.perdido / v.cotizado) * 100 : 0;
    const tasaCobro = v.facturado > 0 ? (v.cobrado / v.facturado) * 100 : 100;
    return {
      key,
      cotizado: v.cotizado,
      facturado: v.facturado,
      perdido: v.perdido,
      cobrado: v.cobrado,
      tasaConversion: Math.round(tasaConversion * 100) / 100,
      tasaPerdida: Math.round(tasaPerdida * 100) / 100,
      tasaCobro: Math.round(tasaCobro * 100) / 100,
    };
  });

  rows.sort((a, b) => b.facturado - a.facturado);

  const totales = rows.reduce(
    (acc, r) => ({
      cotizado: acc.cotizado + r.cotizado,
      facturado: acc.facturado + r.facturado,
      perdido: acc.perdido + r.perdido,
      cobrado: acc.cobrado + r.cobrado,
    }),
    { cotizado: 0, facturado: 0, perdido: 0, cobrado: 0 },
  );

  const conversionGlobal = totales.cotizado > 0 ? (totales.facturado / totales.cotizado) * 100 : 0;
  const perdidaGlobal = totales.cotizado > 0 ? (totales.perdido / totales.cotizado) * 100 : 0;
  const cobroGlobal = totales.facturado > 0 ? (totales.cobrado / totales.facturado) * 100 : 100;

  return {
    rows,
    totales: {
      cotizado: Math.round(totales.cotizado * 100) / 100,
      facturado: Math.round(totales.facturado * 100) / 100,
      perdido: Math.round(totales.perdido * 100) / 100,
      cobrado: Math.round(totales.cobrado * 100) / 100,
    },
    conversionGlobal: Math.round(conversionGlobal * 100) / 100,
    perdidaGlobal: Math.round(perdidaGlobal * 100) / 100,
    cobroGlobal: Math.round(cobroGlobal * 100) / 100,
  };
}
