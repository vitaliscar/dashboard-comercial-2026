export interface CobranzaItemInput {
  cliente: string;
  facturaNumero?: string | null;
  saldo: number | string;
  sucursalId?: string | null;
}

export interface ClienteEmpeoro {
  cliente: string;
  saldoActual: number;
  saldoAnterior: number;
  delta: number;
}

export interface ComparacionSnapshotsResult {
  tieneHistorico: boolean;
  totalVencidoActual: number;
  totalVencidoAnterior: number;
  deltaVencido: number;
  clientesEmpeoraron: ClienteEmpeoro[];
}

export function compararSnapshots(
  actual: CobranzaItemInput[],
  anterior: CobranzaItemInput[] | null,
): ComparacionSnapshotsResult {
  const parseVal = (v: number | string) => (typeof v === "number" ? v : parseFloat(v) || 0);

  const totalActual = actual.reduce((acc, r) => acc + parseVal(r.saldo), 0);

  if (anterior === null) {
    return {
      tieneHistorico: false,
      totalVencidoActual: totalActual,
      totalVencidoAnterior: 0,
      deltaVencido: 0,
      clientesEmpeoraron: [],
    };
  }

  const totalAnterior = anterior.reduce((acc, r) => acc + parseVal(r.saldo), 0);
  const deltaVencido = totalActual - totalAnterior;

  const actualPorCliente = new Map<string, number>();
  for (const r of actual) {
    actualPorCliente.set(r.cliente, (actualPorCliente.get(r.cliente) || 0) + parseVal(r.saldo));
  }

  const anteriorPorCliente = new Map<string, number>();
  for (const r of anterior) {
    anteriorPorCliente.set(r.cliente, (anteriorPorCliente.get(r.cliente) || 0) + parseVal(r.saldo));
  }

  const todosClientes = new Set([...actualPorCliente.keys(), ...anteriorPorCliente.keys()]);
  const deltas: ClienteEmpeoro[] = [];

  for (const cliente of todosClientes) {
    const saldoAct = actualPorCliente.get(cliente) || 0;
    const saldoAnt = anteriorPorCliente.get(cliente) || 0;
    const delta = saldoAct - saldoAnt;

    if (delta > 0) {
      deltas.push({
        cliente,
        saldoActual: saldoAct,
        saldoAnterior: saldoAnt,
        delta,
      });
    }
  }

  deltas.sort((a, b) => b.delta - a.delta);
  const clientesEmpeoraron = deltas.slice(0, 5);

  return {
    tieneHistorico: true,
    totalVencidoActual: totalActual,
    totalVencidoAnterior: totalAnterior,
    deltaVencido,
    clientesEmpeoraron,
  };
}

export interface ParetoCobranzaItem {
  cliente: string;
  saldo: number;
  porcentaje: number;
  porcentajeAcumulado: number;
  esTop80: boolean;
}

export function calcularParetoCobranzas(
  rows: { cliente: string; saldo: number | string }[],
): ParetoCobranzaItem[] {
  const parseVal = (v: number | string) => (typeof v === "number" ? v : parseFloat(v) || 0);

  const porCliente = new Map<string, number>();
  for (const r of rows) {
    const val = parseVal(r.saldo);
    if (val > 0) {
      porCliente.set(r.cliente, (porCliente.get(r.cliente) || 0) + val);
    }
  }

  const lista = Array.from(porCliente.entries())
    .map(([cliente, saldo]) => ({ cliente, saldo }))
    .sort((a, b) => b.saldo - a.saldo);

  const totalGeneral = lista.reduce((sum, item) => sum + item.saldo, 0);
  if (totalGeneral === 0) return [];

  let acumulado = 0;
  return lista.map((item) => {
    acumulado += item.saldo;
    const porcentaje = (item.saldo / totalGeneral) * 100;
    const porcentajeAcumulado = (acumulado / totalGeneral) * 100;
    const esTop80 = porcentajeAcumulado <= 80 || (acumulado - item.saldo) / totalGeneral < 0.8;

    return {
      cliente: item.cliente,
      saldo: item.saldo,
      porcentaje,
      porcentajeAcumulado,
      esTop80,
    };
  });
}

export interface SegmentacionCobranzasResult {
  porSucursal: { sucursal: string; total: number }[];
  porUnidad: { unidad: string; total: number }[];
}

export function segmentarCobranzas(
  rows: { sucursal: string; unidadNegocio: string | null; saldo: number | string }[],
): SegmentacionCobranzasResult {
  const parseVal = (v: number | string) => (typeof v === "number" ? v : parseFloat(v) || 0);

  const sucursalMap = new Map<string, number>();
  const unidadMap = new Map<string, number>();

  for (const r of rows) {
    const val = parseVal(r.saldo);
    const suc = r.sucursal?.trim() || "Sin Sucursal";
    sucursalMap.set(suc, (sucursalMap.get(suc) || 0) + val);

    const un = r.unidadNegocio?.trim() || "Sin Unidad";
    unidadMap.set(un, (unidadMap.get(un) || 0) + val);
  }

  const porSucursal = Array.from(sucursalMap.entries())
    .map(([sucursal, total]) => ({ sucursal, total }))
    .sort((a, b) => b.total - a.total);

  const porUnidad = Array.from(unidadMap.entries())
    .map(([unidad, total]) => ({ unidad, total }))
    .sort((a, b) => b.total - a.total);

  return { porSucursal, porUnidad };
}
