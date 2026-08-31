/**
 * Health Score de cliente (0-100, mayor = más sano) — ver
 * docs/MASTER_STRATEGY.md §4 Módulo 3 (Cliente 360° + Riesgo).
 *
 * health = 100
 *   − w1·norm(dias_vencido_max)   // morosidad
 *   − w2·norm(saldo_vencido)       // exposición
 *   − w3·norm(recencia_dias)       // inactividad
 *   − w4·norm(monto_perdido_reciente) // fricción
 *   + w5·norm(LTV)                  // valor
 */

export interface HealthScoreInput {
  diasVencidoMax: number;
  saldoVencido: number;
  recenciaDias: number;
  montoPerdidoReciente: number;
  ltv: number;
}

export interface HealthScoreWeights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  w5: number;
}

export interface HealthScoreRefs {
  diasVencidoRef: number;
  saldoVencidoRef: number;
  recenciaRef: number;
  montoPerdidoRef: number;
  ltvRef: number;
}

export const DEFAULT_WEIGHTS: HealthScoreWeights = { w1: 25, w2: 25, w3: 20, w4: 15, w5: 15 };

// Valores de referencia por defecto — placeholders razonables (ajustables sin
// tocar la fórmula): 90 días de mora, $10k de saldo vencido, 180 días sin
// comprar, $5k perdido reciente y $100k de LTV ya se consideran "el máximo"
// para efectos de normalización.
export const DEFAULT_REFS: HealthScoreRefs = {
  diasVencidoRef: 90,
  saldoVencidoRef: 10_000,
  recenciaRef: 180,
  montoPerdidoRef: 5_000,
  ltvRef: 100_000,
};

function norm(valor: number, ref: number): number {
  if (ref <= 0) return 0;
  return Math.min(1, Math.max(0, valor / ref));
}

export type HealthBand = "sano" | "atencion" | "riesgo";

export function healthBand(score: number): HealthBand {
  if (score >= 70) return "sano";
  if (score >= 40) return "atencion";
  return "riesgo";
}

export function computeHealthScore(
  input: HealthScoreInput,
  weights: HealthScoreWeights = DEFAULT_WEIGHTS,
  refs: HealthScoreRefs = DEFAULT_REFS,
): number {
  const { w1, w2, w3, w4, w5 } = weights;
  const score =
    100 -
    w1 * norm(input.diasVencidoMax, refs.diasVencidoRef) -
    w2 * norm(input.saldoVencido, refs.saldoVencidoRef) -
    w3 * norm(input.recenciaDias, refs.recenciaRef) -
    w4 * norm(input.montoPerdidoReciente, refs.montoPerdidoRef) +
    w5 * norm(input.ltv, refs.ltvRef);

  return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}
