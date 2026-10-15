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
  pesoAop?: number | null;
  pctGestion: number;
  factoresGestion?: {
    inversionAop: number;
    dropSize: number;
    cartera: number;
    portafolio: number;
  };
  fuentes?: { directorio?: string; gestion?: string };
  incrementalUsd: number;
};
export type ConfigPresupuesto2027 = {
  anioObjetivo: number;
  nombreEscenario?: string;
  mesCierre: number;
  topeAtipico: number;
  pesosAnio: Record<number, number>;
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

export function configPresupuesto2027(unidades: Array<{ id: string; nombre: string }>, anioObjetivo = 2027): ConfigPresupuesto2027 {
  const years = [anioObjetivo - 3, anioObjetivo - 2, anioObjetivo - 1];
  const annualWeights = years.reduce<Record<number, number>>((weights, year, index) => { weights[year] = [0.2, 0.3, 0.5][index]; return weights; }, {});
  return {
    ...PRESUPUESTO_2027_DEFAULTS, anioObjetivo, nombreEscenario: "Base recomendada",
    pesosAnio: annualWeights,
    pesosTendencia: { ...PRESUPUESTO_2027_DEFAULTS.pesosTendencia },
    premisas: unidades.map(({ id, nombre }) => ({ unidadNegocioId: id, unidad: nombre, gTendenciaOverride: null, pctDirectorio: 0, pesoAop: null, pctGestion: 0, factoresGestion: { inversionAop: 0, dropSize: 0, cartera: 0, portafolio: 0 }, fuentes: {}, incrementalUsd: 0 })),
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
  const targetYear = Number.isInteger(config.anioObjetivo) ? config.anioObjetivo : 2027;
  const years = [targetYear - 3, targetYear - 2, targetYear - 1];
  const [seasonYear1, seasonYear2, latestYear] = years;
  if (!Number.isInteger(config.mesCierre) || config.mesCierre < 1 || config.mesCierre > 12 || !Number.isFinite(config.topeAtipico) || config.topeAtipico <= 0) {
    throw new Error("PRESUPUESTO_INVALIDO:Los parámetros de cierre y tope atípico no son válidos.");
  }
  const unidades = new Map<string, string>();
  for (const row of history) if (row.anio >= seasonYear1 && row.anio <= latestYear && !(row.anio === latestYear && row.mes > config.mesCierre)) unidades.set(row.unidadNegocioId, row.unidad);
  const premises = new Map(config.premisas.map((row) => [row.unidadNegocioId, row]));
  const aopValues = config.premisas.map((row) => row.pesoAop);
  const hasAopWeights = aopValues.some((value) => value !== null && value !== undefined);
  if (hasAopWeights && (aopValues.some((value) => value === null || value === undefined || !Number.isFinite(value) || value < 0 || value > 1) || Math.abs(aopValues.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) - 1) > 0.00001)) {
    throw new Error("PRESUPUESTO_INVALIDO:Los pesos AOP de las unidades deben estar completos y sumar 100 %.");
  }
  const missing = [...unidades.keys()].filter((id) => !premises.has(id));
  if (missing.length) throw new Error(`PRESUPUESTO_INVALIDO:Faltan premisas para ${missing.join(", ")}.`);
  const data = history.filter((row) => row.anio >= seasonYear1 && row.anio <= latestYear && !(row.anio === latestYear && row.mes > config.mesCierre));
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
  const historicalProjectionTotal = [...unidades.keys()].reduce((total, unitId) => {
    const seasonalYears = [seasonYear1, seasonYear2].map((year) => {
      const monthly = monthKeys(unitId, year).map((key) => monthUnitYear.get(key) ?? 0);
      const cap = median(monthly) * config.topeAtipico;
      const clipped = monthly.map((amount) => Math.min(amount, cap));
      const mean = clipped.reduce((sum, amount) => sum + amount, 0) / 12;
      return mean > 0 ? clipped.map((amount) => amount / mean) : Array.from({ length: 12 }, () => 0);
    });
    const closedIndex = Array.from({ length: config.mesCierre }, (_, index) => (seasonalYears[0]![index] + seasonalYears[1]![index]) / 2).reduce((sum, value) => sum + value, 0);
    const ytd = monthKeys(unitId, latestYear).slice(0, config.mesCierre).reduce((sum, key) => sum + (monthUnitYear.get(key) ?? 0), 0);
    return total + (closedIndex > 0 ? ytd * 12 / closedIndex : 0);
  }, 0);
  const seasonality = new Map<string, number>();
  const summary: Record<string, unknown>[] = [];
  const detail: Array<Record<string, unknown>> = [];

  for (const [unitId, unitName] of unidades) {
    const annualIE = new Map<number, number[]>();
    for (const year of [seasonYear1, seasonYear2]) {
      const amounts = monthKeys(unitId, year).map((key) => monthUnitYear.get(key) ?? 0);
      const cap = median(amounts) * config.topeAtipico;
      const clipped = amounts.map((amount) => Math.min(amount, cap));
      const mean = clipped.reduce((sum, amount) => sum + amount, 0) / 12;
      if (mean <= 0) throw new Error(`PRESUPUESTO_INVALIDO:No hay datos de estacionalidad suficientes para ${unitName} en ${year}.`);
      annualIE.set(year, clipped.map((amount) => amount / mean));
    }
    const indices = Array.from({ length: 12 }, (_, index) => (annualIE.get(seasonYear1)![index] + annualIE.get(seasonYear2)![index]) / 2);
    const ieTotal = indices.reduce((sum, value) => sum + value, 0);
    if (Math.abs(ieTotal - 12) > 1e-8) throw new Error(`PRESUPUESTO_INVALIDO:El índice estacional de ${unitName} no suma 12.`);
    indices.forEach((value, index) => seasonality.set(`${unitId}:${index + 1}`, value));

    const byYear = annual.get(unitId)!;
    const totalYear1 = byYear.get(seasonYear1) ?? 0;
    const totalYear2 = byYear.get(seasonYear2) ?? 0;
    const ytdLatest = byYear.get(latestYear) ?? 0;
    if (totalYear1 <= 0 || totalYear2 <= 0 || ytdLatest < 0) throw new Error(`PRESUPUESTO_INVALIDO:Histórico incompleto para ${unitName}.`);
    const backtestMesCorte = Math.min(config.mesCierre, 11);
    const backtestYtd25 = monthKeys(unitId, seasonYear2)
      .slice(0, backtestMesCorte)
      .reduce((sum, key) => sum + (monthUnitYear.get(key) ?? 0), 0);
    const backtestIndiceCerrado = annualIE.get(seasonYear1)!
      .slice(0, backtestMesCorte)
      .reduce((sum, value) => sum + value, 0);
    const backtestProjection = backtestIndiceCerrado > 0
      ? backtestYtd25 * 12 / backtestIndiceCerrado
      : null;
    const backtestErrorPct = backtestProjection === null
      ? null
      : backtestProjection / totalYear2 - 1;
    const closedSeasonality = indices.slice(0, config.mesCierre).reduce((sum, value) => sum + value, 0);
    if (closedSeasonality <= 0) throw new Error(`PRESUPUESTO_INVALIDO:No hay base estacional para proyectar ${unitName} hasta el mes ${config.mesCierre}.`);
    const projectedLatest = ytdLatest * 12 / closedSeasonality;
    const gOlder = totalYear2 / totalYear1 - 1;
    const gRecent = projectedLatest / totalYear2 - 1;
    const trend = gOlder * config.pesosTendencia.g25 + gRecent * config.pesosTendencia.g26;
    const premise = premises.get(unitId)!;
    const growth = premise.gTendenciaOverride ?? trend;
    for (const [label, value] of [["tendencia", growth], ["directorio", premise.pctDirectorio], ["AOP", premise.pesoAop ?? 0], ["gestión", premise.pctGestion], ["incremental", premise.incrementalUsd]] as const) {
      assertFinite(value, `${unitName}/${label}`);
    }
    if ([growth, premise.pctDirectorio, premise.pctGestion].some((value) => value < -1 || value > 5) || premise.incrementalUsd < 0) throw new Error(`PRESUPUESTO_INVALIDO:Las premisas de ${unitName} están fuera de rango.`);
    const factorGestion = premise.factoresGestion
      ? premise.factoresGestion.inversionAop + premise.factoresGestion.dropSize + premise.factoresGestion.cartera + premise.factoresGestion.portafolio
      : premise.pctGestion;
    for (const [label, value] of Object.entries(premise.factoresGestion ?? {})) {
      assertFinite(value, `${unitName}/gestión/${label}`);
      if (value < -1 || value > 5) throw new Error(`PRESUPUESTO_INVALIDO:El factor ${label} de ${unitName} está fuera de rango.`);
    }
    const projectionWithAop = premise.pesoAop == null ? projectedLatest : historicalProjectionTotal * premise.pesoAop;
    const base = projectionWithAop * (1 + growth);
    const withDirector = base * (1 + premise.pctDirectorio);
    const withManagement = withDirector * (1 + factorGestion);
    const budget = withManagement + premise.incrementalUsd;
    const annualShares = new Map<string, number>();
    let totalWeight = 0;
    for (const year of years) {
      const yearTotal = byYear.get(year) ?? 0;
      if (yearTotal <= 0) continue;
      for (const row of data.filter((item) => item.unidadNegocioId === unitId && item.anio === year)) {
        const branchId = row.sucursalId ?? "__sin_sucursal__";
        for (const [canal, amount] of [["ccv", row.ccv], ["xibi", row.xibi], ["estrategicas", row.estrategicas]] as const) {
          const keyShare = `${unitId}:${year}:${branchId}:${canal}`;
          sharesByYear.set(keyShare, (sharesByYear.get(keyShare) ?? 0) + amount / yearTotal);
        }
      }
      totalWeight += (config.pesosAnio[year] ?? 0);
    }
    const weights = new Map<string, number>();
    for (const key of sharesByYear.keys()) {
      if (!key.startsWith(`${unitId}:`)) continue;
      const [, yearRaw, ...shareBits] = key.split(":");
      const year = Number(yearRaw) as number;
      const shareKey = shareBits.join(":");
      annualShares.set(shareKey, (annualShares.get(shareKey) ?? 0) + (config.pesosAnio[year] ?? 0) * sharesByYear.get(key)! / totalWeight);
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
          historico2026: historicalChannelMonth.get(`${unitId}:${latestYear}:${month}:${branchId}:${canal}`) ?? 0,
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
      unidadNegocioId: unitId, unidad: unitName, anioObjetivo: targetYear, aniosHistoricos: years, realesPorAnio: { [seasonYear1]: roundMoney(totalYear1), [seasonYear2]: roundMoney(totalYear2), [latestYear]: roundMoney(ytdLatest) }, backtestMesCorte, backtestProyeccion: backtestProjection === null ? null : roundMoney(backtestProjection), backtestErrorPct,
      proyeccionBase: roundMoney(projectedLatest), proyeccionConAop: roundMoney(projectionWithAop), gAnterior: gOlder, gReciente: gRecent, gTendencia: trend, gUsada: growth, baseObjetivo: roundMoney(base),
      conDirectorio: roundMoney(withDirector), conGestion: roundMoney(withManagement), pctGestionAplicado: factorGestion, pptoObjetivo: roundMoney(budget),
      premisa: premise, indiceEstacional: indices,
      ...(targetYear === 2027 ? { real2024: roundMoney(totalYear1), real2025: roundMoney(totalYear2), real2026Ytd: roundMoney(ytdLatest), proyeccion2026: roundMoney(projectedLatest), ppto2027: roundMoney(budget), base2027: roundMoney(base) } : {}),
    });
  }
  const monthTotals = Array.from({ length: 12 }, (_, index) => ({ mes: index + 1, monto: roundMoney(detail.filter((row) => row.mes === index + 1).reduce((sum, row) => sum + Number(row.monto), 0)) }));
  const totalObjetivo = roundMoney(summary.reduce((sum, row) => sum + Number(row.pptoObjetivo), 0));
  return { anioObjetivo: targetYear, aniosHistoricos: years, summary, detail, monthTotals, totalObjetivo, ...(targetYear === 2027 ? { total2027: totalObjetivo } : {}) };
}
