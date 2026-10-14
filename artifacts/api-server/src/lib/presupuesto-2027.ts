export const PRESUPUESTO_2027_DEFAULTS = {
  mesCierre: 9,
  topeAtipico: 2.5,
  pesosAnio: { 2024: 0.2, 2025: 0.3, 2026: 0.5 },
  pesosTendencia: { g25: 0.3, g26: 0.7 },
} as const;

export type CanalPresupuesto2027 = "ccv" | "xibi" | "estrategicas";
export type PremisaPresupuesto2027 = {
  unidadNegocioId: string;
  unidad: string;
  gTendenciaOverride: number | null;
  pctDirectorio: number;
  pctGestion: number;
  incrementalUsd: number;
};
export type ConfigPresupuesto2027 = {
  mesCierre: number;
  topeAtipico: number;
  pesosAnio: Record<2024 | 2025 | 2026, number>;
  pesosTendencia: { g25: number; g26: number };
  premisas: PremisaPresupuesto2027[];
};
export type HistoricoPresupuesto2027 = {
  anio: number;
  mes: number;
  unidadNegocioId: string;
  unidad: string;
  sucursalId: string | null;
  sucursal: string | null;
  ccv: number;
  xibi: number;
  estrategicas: number;
};

export function configPresupuesto2027(unidades: Array<{ id: string; nombre: string }>): ConfigPresupuesto2027 {
  return {
    ...PRESUPUESTO_2027_DEFAULTS,
    pesosAnio: { ...PRESUPUESTO_2027_DEFAULTS.pesosAnio },
    pesosTendencia: { ...PRESUPUESTO_2027_DEFAULTS.pesosTendencia },
    premisas: unidades.map(({ id, nombre }) => ({ unidadNegocioId: id, unidad: nombre, gTendenciaOverride: null, pctDirectorio: 0, pctGestion: 0, incrementalUsd: 0 })),
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`PRESUPUESTO_INVALIDO:Valor no válido en ${label}.`);
}

export function calcularPresupuesto2027(history: HistoricoPresupuesto2027[], config: ConfigPresupuesto2027) {
  if (!Number.isInteger(config.mesCierre) || config.mesCierre < 1 || config.mesCierre > 12 || !Number.isFinite(config.topeAtipico) || config.topeAtipico <= 0) {
    throw new Error("PRESUPUESTO_INVALIDO:Los parámetros de cierre y tope atípico no son válidos.");
  }
  const unidades = new Map<string, string>();
  for (const row of history) if (row.anio >= 2024 && row.anio <= 2026 && !(row.anio === 2026 && row.mes > config.mesCierre)) unidades.set(row.unidadNegocioId, row.unidad);
  const premises = new Map(config.premisas.map((row) => [row.unidadNegocioId, row]));
  const missing = [...unidades.keys()].filter((id) => !premises.has(id));
  if (missing.length) throw new Error(`PRESUPUESTO_INVALIDO:Faltan premisas para ${missing.join(", ")}.`);
  const data = history.filter((row) => row.anio >= 2024 && row.anio <= 2026 && !(row.anio === 2026 && row.mes > config.mesCierre));
  const real = (row: HistoricoPresupuesto2027) => row.ccv + row.xibi + row.estrategicas;
  const annual = new Map<string, Map<number, number>>();
  const monthUnitYear = new Map<string, number>();
  const sharesByYear = new Map<string, number>();
  const historicalChannelMonth = new Map<string, number>();
  const branchNames = new Map<string, { sucursalId: string | null; sucursal: string }>();
  for (const row of data) {
    const amount = real(row);
    const unitYear = `${row.unidadNegocioId}:${row.anio}`;
    const unitMonthYear = `${unitYear}:${row.mes}`;
    const branchId = row.sucursalId ?? "__sin_sucursal__";
    const cleanBranch = row.sucursalId ? row.sucursal ?? "Sucursal" : "Sin sucursal";
    branchNames.set(`${row.unidadNegocioId}:${branchId}`, { sucursalId: row.sucursalId, sucursal: cleanBranch });
    annual.set(row.unidadNegocioId, annual.get(row.unidadNegocioId) ?? new Map());
    annual.get(row.unidadNegocioId)!.set(row.anio, (annual.get(row.unidadNegocioId)!.get(row.anio) ?? 0) + amount);
    monthUnitYear.set(unitMonthYear, (monthUnitYear.get(unitMonthYear) ?? 0) + amount);
    for (const [canal, channelAmount] of [["ccv", row.ccv], ["xibi", row.xibi], ["estrategicas", row.estrategicas]] as const) {
      const key = `${row.unidadNegocioId}:${row.anio}:${row.mes}:${branchId}:${canal}`;
      historicalChannelMonth.set(key, (historicalChannelMonth.get(key) ?? 0) + channelAmount);
    }
  }
  const monthKeys = (unitId: string, year: number) => Array.from({ length: 12 }, (_, i) => `${unitId}:${year}:${i + 1}`);
  const seasonality = new Map<string, number>();
  const summary: Record<string, unknown>[] = [];
  const detail: Array<Record<string, unknown>> = [];

  for (const [unitId, unitName] of unidades) {
    const annualIE = new Map<number, number[]>();
    for (const year of [2024, 2025]) {
      const amounts = monthKeys(unitId, year).map((key) => monthUnitYear.get(key) ?? 0);
      const cap = median(amounts) * config.topeAtipico;
      const clipped = amounts.map((amount) => Math.min(amount, cap));
      const mean = clipped.reduce((sum, amount) => sum + amount, 0) / 12;
      if (mean <= 0) throw new Error(`PRESUPUESTO_INVALIDO:No hay datos de estacionalidad suficientes para ${unitName} en ${year}.`);
      annualIE.set(year, clipped.map((amount) => amount / mean));
    }
    const indices = Array.from({ length: 12 }, (_, index) => (annualIE.get(2024)![index] + annualIE.get(2025)![index]) / 2);
    const ieTotal = indices.reduce((sum, value) => sum + value, 0);
    if (Math.abs(ieTotal - 12) > 1e-8) throw new Error(`PRESUPUESTO_INVALIDO:El índice estacional de ${unitName} no suma 12.`);
    indices.forEach((value, index) => seasonality.set(`${unitId}:${index + 1}`, value));

    const byYear = annual.get(unitId)!;
    const total24 = byYear.get(2024) ?? 0;
    const total25 = byYear.get(2025) ?? 0;
    const ytd26 = byYear.get(2026) ?? 0;
    if (total24 <= 0 || total25 <= 0 || ytd26 < 0) throw new Error(`PRESUPUESTO_INVALIDO:Histórico incompleto para ${unitName}.`);
    const closedSeasonality = indices.slice(0, config.mesCierre).reduce((sum, value) => sum + value, 0);
    const projection2026 = ytd26 * 12 / closedSeasonality;
    const g25 = total25 / total24 - 1;
    const g26 = projection2026 / total25 - 1;
    const trend = g25 * config.pesosTendencia.g25 + g26 * config.pesosTendencia.g26;
    const premise = premises.get(unitId)!;
    const growth = premise.gTendenciaOverride ?? 0;
    for (const [label, value] of [["tendencia", growth], ["directorio", premise.pctDirectorio], ["gestión", premise.pctGestion], ["incremental", premise.incrementalUsd]] as const) {
      assertFinite(value, `${unitName}/${label}`);
    }
    if ([growth, premise.pctDirectorio, premise.pctGestion].some((value) => value < -1 || value > 5) || premise.incrementalUsd < 0) throw new Error(`PRESUPUESTO_INVALIDO:Las premisas de ${unitName} están fuera de rango.`);
    const base = projection2026 * (1 + growth);
    const withDirector = base * (1 + premise.pctDirectorio);
    const withManagement = withDirector * (1 + premise.pctGestion);
    const budget = withManagement + premise.incrementalUsd;
    const annualShares = new Map<string, number>();
    let totalWeight = 0;
    for (const year of [2024, 2025, 2026] as const) {
      const yearTotal = byYear.get(year) ?? 0;
      if (yearTotal <= 0) continue;
      for (const row of data.filter((item) => item.unidadNegocioId === unitId && item.anio === year)) {
        const branchId = row.sucursalId ?? "__sin_sucursal__";
        for (const [canal, amount] of [["ccv", row.ccv], ["xibi", row.xibi], ["estrategicas", row.estrategicas]] as const) {
          const keyShare = `${unitId}:${year}:${branchId}:${canal}`;
          sharesByYear.set(keyShare, (sharesByYear.get(keyShare) ?? 0) + amount / yearTotal);
        }
      }
      totalWeight += config.pesosAnio[year];
    }
    const weights = new Map<string, number>();
    for (const key of sharesByYear.keys()) {
      if (!key.startsWith(`${unitId}:`)) continue;
      const [, yearRaw, ...shareBits] = key.split(":");
      const year = Number(yearRaw) as 2024 | 2025 | 2026;
      const shareKey = shareBits.join(":");
      annualShares.set(shareKey, (annualShares.get(shareKey) ?? 0) + config.pesosAnio[year] * sharesByYear.get(key)! / totalWeight);
    }
    const weightsSum = [...annualShares.values()].reduce((sum, value) => sum + value, 0);
    if (weightsSum <= 0) throw new Error(`PRESUPUESTO_INVALIDO:No se puede repartir la meta de ${unitName}.`);
    for (const [key, value] of annualShares) weights.set(key, value / weightsSum);

    const raw: Array<{ sucursalId: string | null; sucursal: string; canal: CanalPresupuesto2027; mes: number; peso: number; ie: number; historico2026: number; monto: number }> = [];
    for (const [key, peso] of weights) {
      const [branchId, canal] = key.split(":") as [string, CanalPresupuesto2027];
      const branch = branchNames.get(`${unitId}:${branchId}`) ?? { sucursalId: null, sucursal: "Sin sucursal" };
      for (let month = 1; month <= 12; month++) {
        const amount = budget * peso * (seasonality.get(`${unitId}:${month}`) ?? 0) / 12;
        if (Math.abs(amount) >= 0.005) raw.push({
          ...branch, canal, mes: month, peso, ie: seasonality.get(`${unitId}:${month}`) ?? 0,
          historico2026: historicalChannelMonth.get(`${unitId}:2026:${month}:${branchId}:${canal}`) ?? 0,
          monto: roundMoney(amount),
        });
      }
    }
    const delta = roundMoney(roundMoney(budget) - raw.reduce((sum, row) => sum + row.monto, 0));
    if (Math.abs(delta) >= 0.01) {
      const largest = raw.reduce((index, row, current) => row.monto > raw[index].monto ? current : index, 0);
      if (raw[largest]) raw[largest].monto = roundMoney(raw[largest].monto + delta);
    }
    const assigned = roundMoney(raw.reduce((sum, row) => sum + row.monto, 0));
    if (Math.abs(assigned - roundMoney(budget)) >= 0.01) throw new Error(`PRESUPUESTO_INVALIDO:El detalle de ${unitName} no cuadra con su meta.`);
    detail.push(...raw.map((row) => ({ unidadNegocioId: unitId, unidad: unitName, ...row })));
    summary.push({
      unidadNegocioId: unitId, unidad: unitName, real2024: roundMoney(total24), real2025: roundMoney(total25), real2026Ytd: roundMoney(ytd26),
      proyeccion2026: roundMoney(projection2026), g25, g26, gTendencia: trend, gUsada: growth, base2027: roundMoney(base),
      conDirectorio: roundMoney(withDirector), conGestion: roundMoney(withManagement), ppto2027: roundMoney(budget),
      premisa: premise, indiceEstacional: indices,
    });
  }
  const monthTotals = Array.from({ length: 12 }, (_, index) => ({ mes: index + 1, monto: roundMoney(detail.filter((row) => row.mes === index + 1).reduce((sum, row) => sum + Number(row.monto), 0)) }));
  return { summary, detail, monthTotals, total2027: roundMoney(summary.reduce((sum, row) => sum + Number(row.ppto2027), 0)) };
}
