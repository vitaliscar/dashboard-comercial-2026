/**
 * Análisis de cohortes de retención — ver docs/MASTER_STRATEGY.md §2.3.C.
 * Fuente: facturas. Cohorte = mes de la primera factura del cliente.
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

export interface CohorteInputFactura {
  cliente: string;
  fecha: string;
  monto: number;
}

export interface CohorteRow {
  /** "YYYY-MM" del mes de alta de la cohorte. */
  cohorte: string;
  tamano: number;
  /** offset (meses desde el alta) -> % de clientes retenidos. */
  retencionPorOffset: number[];
  /** offset -> % de revenue retenido (NRR aproximado) respecto al mes de alta. */
  nrrPorOffset: number[];
}

function mesIndice(fecha: Date): number {
  return fecha.getFullYear() * 12 + fecha.getMonth();
}

function mesLabel(indice: number): string {
  const anio = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/**
 * Construye la matriz de cohortes (cohorte × offset en meses) con retención
 * de clientes y NRR (revenue retention) hasta `maxOffset` meses.
 */
export function computeCohortes(facturas: CohorteInputFactura[], maxOffset = 12): CohorteRow[] {
  type Punto = { indice: number; monto: number };
  const porCliente = new Map<string, Punto[]>();

  for (const f of facturas) {
    const key = normalize(f.cliente);
    if (!key) continue;
    const fecha = new Date(f.fecha);
    if (isNaN(fecha.getTime())) continue;
    const punto = { indice: mesIndice(fecha), monto: Number(f.monto) || 0 };
    const arr = porCliente.get(key);
    if (arr) arr.push(punto);
    else porCliente.set(key, [punto]);
  }

  // cohorte (indice del primer mes) -> { clientes: Set, montoPorOffset: Map<offset, monto>, clientesPorOffset: Map<offset, Set> }
  const cohortes = new Map<
    number,
    {
      clientes: Set<string>;
      montoPorOffset: Map<number, number>;
      clientesPorOffset: Map<number, Set<string>>;
    }
  >();

  for (const [cliente, puntos] of porCliente.entries()) {
    const primerMes = Math.min(...puntos.map((p) => p.indice));
    let cohorte = cohortes.get(primerMes);
    if (!cohorte) {
      cohorte = { clientes: new Set(), montoPorOffset: new Map(), clientesPorOffset: new Map() };
      cohortes.set(primerMes, cohorte);
    }
    cohorte.clientes.add(cliente);

    for (const p of puntos) {
      const offset = p.indice - primerMes;
      if (offset < 0 || offset > maxOffset) continue;
      cohorte.montoPorOffset.set(offset, (cohorte.montoPorOffset.get(offset) ?? 0) + p.monto);
      const set = cohorte.clientesPorOffset.get(offset) ?? new Set<string>();
      set.add(cliente);
      cohorte.clientesPorOffset.set(offset, set);
    }
  }

  const rows: CohorteRow[] = Array.from(cohortes.entries())
    .sort(([a], [b]) => a - b)
    .map(([indice, c]) => {
      const tamano = c.clientes.size;
      const montoBase = c.montoPorOffset.get(0) ?? 0;
      const retencionPorOffset: number[] = [];
      const nrrPorOffset: number[] = [];
      for (let offset = 0; offset <= maxOffset; offset++) {
        const clientesEnOffset = c.clientesPorOffset.get(offset)?.size ?? 0;
        retencionPorOffset.push(
          tamano > 0 ? Math.round((clientesEnOffset / tamano) * 10000) / 100 : 0,
        );
        const montoOffset = c.montoPorOffset.get(offset) ?? 0;
        nrrPorOffset.push(montoBase > 0 ? Math.round((montoOffset / montoBase) * 10000) / 100 : 0);
      }
      return { cohorte: mesLabel(indice), tamano, retencionPorOffset, nrrPorOffset };
    });

  return rows;
}
