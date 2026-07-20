/**
 * Cross-sell / Next-Best-Offer por co-ocurrencia de unidades de negocio —
 * ver docs/MASTER_STRATEGY.md §2.3.E. Fuente: facturas ∪ servicios,
 * agrupadas por (cliente, unidad_negocio_id). Market-basket a nivel de
 * unidad de negocio (no hay SKU en el esquema).
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

export interface CrossSellInputTransaccion {
  cliente: string;
  unidad_negocio_id: string;
}

export interface UnidadPairMetric {
  unidadA: string;
  unidadB: string;
  soporte: number;
  confianza: number;
  lift: number;
}

export interface NextBestOffer {
  cliente: string;
  unidadSugerida: string;
  lift: number;
}

/**
 * Calcula soporte/confianza/lift para cada par ordenado de unidades
 * (unidadA -> unidadB): de los clientes que compran unidadA, qué fracción
 * también compra unidadB, ajustado por qué tan común es unidadB en general.
 */
export function computeAfinidadUnidades(
  transacciones: CrossSellInputTransaccion[],
): UnidadPairMetric[] {
  const unidadesPorCliente = new Map<string, Set<string>>();
  for (const t of transacciones) {
    const cliente = normalize(t.cliente);
    if (!cliente || !t.unidad_negocio_id) continue;
    const set = unidadesPorCliente.get(cliente) ?? new Set<string>();
    set.add(t.unidad_negocio_id);
    unidadesPorCliente.set(cliente, set);
  }

  const totalClientes = unidadesPorCliente.size;
  if (totalClientes === 0) return [];

  const clientesPorUnidad = new Map<string, number>();
  const clientesPorPar = new Map<string, number>();

  for (const unidades of unidadesPorCliente.values()) {
    const lista = Array.from(unidades);
    for (const u of lista) {
      clientesPorUnidad.set(u, (clientesPorUnidad.get(u) ?? 0) + 1);
    }
    for (const a of lista) {
      for (const b of lista) {
        if (a === b) continue;
        const key = `${a}|${b}`;
        clientesPorPar.set(key, (clientesPorPar.get(key) ?? 0) + 1);
      }
    }
  }

  const resultados: UnidadPairMetric[] = [];
  for (const [key, clientesConAmbas] of clientesPorPar.entries()) {
    const [unidadA, unidadB] = key.split("|");
    const clientesA = clientesPorUnidad.get(unidadA) ?? 0;
    const clientesB = clientesPorUnidad.get(unidadB) ?? 0;
    if (clientesA === 0 || clientesB === 0) continue;

    const soporte = clientesConAmbas / totalClientes;
    const confianza = clientesConAmbas / clientesA;
    const probB = clientesB / totalClientes;
    const lift = probB > 0 ? confianza / probB : 0;

    resultados.push({
      unidadA,
      unidadB,
      soporte: Math.round(soporte * 10000) / 10000,
      confianza: Math.round(confianza * 10000) / 10000,
      lift: Math.round(lift * 10000) / 10000,
    });
  }

  return resultados.sort((a, b) => b.lift - a.lift);
}

/**
 * Para cada cliente, sugiere hasta `topN` unidades que aún no compra,
 * ordenadas por lift descendente respecto a las unidades que sí compra.
 */
export function computeNextBestOffers(
  transacciones: CrossSellInputTransaccion[],
  topN = 3,
): NextBestOffer[] {
  const pares = computeAfinidadUnidades(transacciones);
  const unidadesPorCliente = new Map<string, Set<string>>();
  const clienteOriginal = new Map<string, string>();

  for (const t of transacciones) {
    const key = normalize(t.cliente);
    if (!key || !t.unidad_negocio_id) continue;
    clienteOriginal.set(key, t.cliente);
    const set = unidadesPorCliente.get(key) ?? new Set<string>();
    set.add(t.unidad_negocio_id);
    unidadesPorCliente.set(key, set);
  }

  const sugerencias: NextBestOffer[] = [];

  for (const [key, unidadesCliente] of unidadesPorCliente.entries()) {
    const candidatas = new Map<string, number>();
    for (const unidadPropia of unidadesCliente) {
      for (const par of pares) {
        if (par.unidadA !== unidadPropia) continue;
        if (unidadesCliente.has(par.unidadB)) continue;
        const liftPrevio = candidatas.get(par.unidadB) ?? 0;
        if (par.lift > liftPrevio) candidatas.set(par.unidadB, par.lift);
      }
    }

    const top = Array.from(candidatas.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN);

    for (const [unidadSugerida, lift] of top) {
      sugerencias.push({ cliente: clienteOriginal.get(key) ?? key, unidadSugerida, lift });
    }
  }

  return sugerencias;
}
