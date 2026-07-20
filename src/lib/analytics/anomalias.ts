/**
 * Detección de anomalías en caída de ventas por asesor — ver
 * docs/MASTER_STRATEGY.md §2.3.D. Fuente: cumplimiento_asesores (venta, mes).
 */

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mid - 1] + ordenados[mid]) / 2 : ordenados[mid];
}

/** z-score robusto vía MAD (median absolute deviation). Constante 0.6745 hace
 * que el MAD sea comparable a la desviación estándar bajo normalidad. */
export function zScoreRobusto(valor: number, serieHistorica: number[]): number {
  const med = mediana(serieHistorica);
  const mad = mediana(serieHistorica.map((v) => Math.abs(v - med)));
  if (mad === 0) return 0;
  return (0.6745 * (valor - med)) / mad;
}

export interface AnomaliaVentaInput {
  asesor: string;
  /** Serie histórica de ventas mensuales, en orden cronológico, SIN incluir el mes evaluado. */
  serieHistorica: number[];
  ventaMesActual: number;
}

export interface AnomaliaVentaRow {
  asesor: string;
  zScore: number;
  esAnomalia: boolean;
}

const UMBRAL_ANOMALIA = -3.5;

/** Marca como anomalía de caída todo asesor cuyo z-score robusto del mes
 * actual sea <= -3.5 respecto a su propia serie histórica. */
export function detectarAnomaliasVenta(inputs: AnomaliaVentaInput[]): AnomaliaVentaRow[] {
  return inputs
    .map((input) => {
      const zScore = zScoreRobusto(input.ventaMesActual, input.serieHistorica);
      return {
        asesor: input.asesor,
        zScore: Math.round(zScore * 100) / 100,
        esAnomalia: zScore <= UMBRAL_ANOMALIA,
      };
    })
    .sort((a, b) => a.zScore - b.zScore);
}

export interface RunRateInput {
  asesor: string;
  ventaAcumuladaMes: number;
  diasTranscurridosMes: number;
  diasTotalesMes: number;
  metaMes: number;
}

export interface RunRateRow {
  asesor: string;
  runRate: number;
  metaMes: number;
  cumplimientoProyectado: number;
  enRiesgo: boolean;
}

const UMBRAL_RUN_RATE = 0.7;

/**
 * Run-rate: proyección de venta de fin de mes al ritmo actual. Marca en
 * riesgo cuando la venta proyectada cae por debajo del 70% de la meta.
 */
export function calcularRunRate(inputs: RunRateInput[]): RunRateRow[] {
  return inputs
    .map((input) => {
      const runRate =
        input.diasTranscurridosMes > 0
          ? (input.ventaAcumuladaMes / input.diasTranscurridosMes) * input.diasTotalesMes
          : 0;
      const cumplimientoProyectado = input.metaMes > 0 ? (runRate / input.metaMes) * 100 : 0;
      return {
        asesor: input.asesor,
        runRate: Math.round(runRate * 100) / 100,
        metaMes: input.metaMes,
        cumplimientoProyectado: Math.round(cumplimientoProyectado * 100) / 100,
        enRiesgo: input.metaMes > 0 && runRate < UMBRAL_RUN_RATE * input.metaMes,
      };
    })
    .sort((a, b) => a.cumplimientoProyectado - b.cumplimientoProyectado);
}
