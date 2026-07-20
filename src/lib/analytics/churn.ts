/**
 * Churn de clientes (fuga): cliente activo que dejó de facturar.
 * Ver docs/MASTER_STRATEGY.md §2.3.A. Fuente: facturas (cliente, fecha, monto).
 *
 * No hay tabla `clientes` — la identidad es el string `cliente` normalizado
 * (misma convención que src/lib/analytics/funnel.ts).
 */

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export interface ChurnInputFactura {
  cliente: string;
  fecha: string;
  monto: number;
}

export interface ClienteChurnRow {
  cliente: string;
  ultimaFactura: string;
  recenciaDias: number;
  totalHistorico: number;
  esChurn: boolean;
}

export interface ChurnSummary {
  rows: ClienteChurnRow[];
  clientesActivos: number;
  clientesEnChurn: number;
  churnRate: number;
}

const DIA_MS = 1000 * 60 * 60 * 24;

/**
 * Calcula el estado de churn por cliente sobre una ventana de `ventanaMeses`
 * (por defecto 6): un cliente entra en churn si su última factura es anterior
 * a `hoy - ventanaMeses` y tiene historial de facturación (> 0).
 */
export function computeChurn(
  facturas: ChurnInputFactura[],
  ventanaMeses = 6,
  hoy: Date = new Date(),
): ChurnSummary {
  const porCliente = new Map<string, { cliente: string; ultimaFecha: Date; total: number }>();

  for (const f of facturas) {
    const key = normalize(f.cliente);
    if (!key) continue;
    const fecha = new Date(f.fecha);
    if (isNaN(fecha.getTime())) continue;
    const entry = porCliente.get(key);
    if (!entry) {
      porCliente.set(key, { cliente: f.cliente, ultimaFecha: fecha, total: Number(f.monto) || 0 });
    } else {
      entry.total += Number(f.monto) || 0;
      if (fecha > entry.ultimaFecha) entry.ultimaFecha = fecha;
    }
  }

  const cutoff = new Date(hoy);
  cutoff.setMonth(cutoff.getMonth() - ventanaMeses);

  const rows: ClienteChurnRow[] = Array.from(porCliente.values()).map((e) => {
    const recenciaDias = Math.floor((hoy.getTime() - e.ultimaFecha.getTime()) / DIA_MS);
    const esChurn = e.ultimaFecha < cutoff && e.total > 0;
    return {
      cliente: e.cliente,
      ultimaFactura: e.ultimaFecha.toISOString().slice(0, 10),
      recenciaDias,
      totalHistorico: Math.round(e.total * 100) / 100,
      esChurn,
    };
  });

  rows.sort((a, b) => b.recenciaDias - a.recenciaDias);

  const clientesActivos = rows.length;
  const clientesEnChurn = rows.filter((r) => r.esChurn).length;
  const churnRate = clientesActivos > 0 ? (clientesEnChurn / clientesActivos) * 100 : 0;

  return {
    rows,
    clientesActivos,
    clientesEnChurn,
    churnRate: Math.round(churnRate * 100) / 100,
  };
}
