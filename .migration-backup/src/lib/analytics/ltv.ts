/**
 * LTV (Life Time Value) cruzado con unidades/servicios — ver
 * docs/MASTER_STRATEGY.md §2.3.B. Fuentes: facturas, servicios.
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

export interface LtvInputTransaccion {
  cliente: string;
  fecha: string;
  monto: number;
  unidad_negocio_id: string | null;
}

export interface ClienteLtvRow {
  cliente: string;
  ltvHistorico: number;
  nUnidades: number;
  penetracion: number;
  mesesActivo: number;
  ventaMensualPromedio: number;
  ltvProyectado: number;
}

/**
 * LTV histórico + proyectado por cliente, cruzando facturas y servicios.
 *
 * - LTV histórico = Σ monto (facturas ∪ servicios) del cliente.
 * - Amplitud de cartera = # unidades de negocio distintas en las que compra.
 * - Penetración = amplitud / nUnidadesTotalesActivas (todas las unidades con
 *   al menos una transacción en el dataset).
 * - LTV proyectado = ventaMensualPromedio × vidaEsperadaMeses, donde
 *   vidaEsperadaMeses = 1 / churnRateMensual (churnRate en fracción, no %).
 */
export function computeLtv(
  transacciones: LtvInputTransaccion[],
  churnRateMensual: number,
): ClienteLtvRow[] {
  const porCliente = new Map<
    string,
    { cliente: string; total: number; unidades: Set<string>; meses: Set<string> }
  >();
  const unidadesTotales = new Set<string>();

  for (const t of transacciones) {
    const key = normalize(t.cliente);
    if (!key) continue;
    if (t.unidad_negocio_id) unidadesTotales.add(t.unidad_negocio_id);

    let entry = porCliente.get(key);
    if (!entry) {
      entry = { cliente: t.cliente, total: 0, unidades: new Set(), meses: new Set() };
      porCliente.set(key, entry);
    }
    entry.total += Number(t.monto) || 0;
    if (t.unidad_negocio_id) entry.unidades.add(t.unidad_negocio_id);
    const fecha = new Date(t.fecha);
    if (!isNaN(fecha.getTime())) {
      entry.meses.add(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`);
    }
  }

  const nUnidadesTotales = unidadesTotales.size || 1;
  const vidaEsperadaMeses = churnRateMensual > 0 ? 1 / churnRateMensual : 36; // cap razonable si no hay churn medible

  return Array.from(porCliente.values())
    .map((e) => {
      const mesesActivo = Math.max(1, e.meses.size);
      const ventaMensualPromedio = e.total / mesesActivo;
      return {
        cliente: e.cliente,
        ltvHistorico: Math.round(e.total * 100) / 100,
        nUnidades: e.unidades.size,
        penetracion: Math.round((e.unidades.size / nUnidadesTotales) * 10000) / 10000,
        mesesActivo,
        ventaMensualPromedio: Math.round(ventaMensualPromedio * 100) / 100,
        ltvProyectado: Math.round(ventaMensualPromedio * vidaEsperadaMeses * 100) / 100,
      };
    })
    .sort((a, b) => b.ltvHistorico - a.ltvHistorico);
}
