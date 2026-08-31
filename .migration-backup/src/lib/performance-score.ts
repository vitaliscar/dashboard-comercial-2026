export interface MonthlyPoint {
  mes: number;
  venta: number;
  presupuesto: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Cumplimiento agregado del período: venta total / presupuesto total, en 0-100. */
export function cumplimientoScore(puntos: MonthlyPoint[]): number {
  const venta = puntos.reduce((a, p) => a + p.venta, 0);
  const presupuesto = puntos.reduce((a, p) => a + p.presupuesto, 0);
  if (presupuesto <= 0) return 0;
  return clamp((venta / presupuesto) * 100, 0, 100);
}

/**
 * Tendencia: compara el cumplimiento del primer vs. último mes con datos.
 * +20 puntos de cumplimiento de mejora o más = score 100. Empeorar 20 o más = 0.
 * Un solo mes de datos = neutral (50, no hay tendencia que medir).
 */
export function tendenciaScore(puntos: MonthlyPoint[]): number {
  const conDatos = puntos.filter((p) => p.presupuesto > 0).sort((a, b) => a.mes - b.mes);
  if (conDatos.length < 2) return 50;
  const primero = conDatos[0];
  const ultimo = conDatos[conDatos.length - 1];
  const cumplPrimero = (primero.venta / primero.presupuesto) * 100;
  const cumplUltimo = (ultimo.venta / ultimo.presupuesto) * 100;
  const delta = cumplUltimo - cumplPrimero;
  return clamp(50 + (delta / 20) * 50, 0, 100);
}

/** Ticket promedio propio vs. promedio del grupo de pares, capado a 2x el grupo = 100. */
export function ticketScore(ticketPropio: number, ticketPromedioGrupo: number): number {
  if (ticketPromedioGrupo <= 0) return 50;
  const ratio = ticketPropio / ticketPromedioGrupo;
  return clamp(ratio * 50, 0, 100);
}

export interface CompositeScoreInput {
  puntos: MonthlyPoint[];
  ticketPropio: number;
  ticketPromedioGrupo: number;
}

export interface CompositeScoreResult {
  score: number;
  cumplimiento: number;
  tendencia: number;
  ticket: number;
  banda: "success" | "warning" | "danger";
}

const PESO_CUMPLIMIENTO = 0.5;
const PESO_TENDENCIA = 0.3;
const PESO_TICKET = 0.2;

export function calcularScoreCompuesto({
  puntos,
  ticketPropio,
  ticketPromedioGrupo,
}: CompositeScoreInput): CompositeScoreResult {
  const cumplimiento = cumplimientoScore(puntos);
  const tendencia = tendenciaScore(puntos);
  const ticket = ticketScore(ticketPropio, ticketPromedioGrupo);
  const score =
    cumplimiento * PESO_CUMPLIMIENTO + tendencia * PESO_TENDENCIA + ticket * PESO_TICKET;
  const banda = score >= 90 ? "success" : score >= 50 ? "warning" : "danger";
  return { score: Math.round(score), cumplimiento, tendencia, ticket, banda };
}

/** Percentil del valor propio dentro de una lista de valores de pares (0-100). */
export function percentilEnGrupo(valorPropio: number, valoresGrupo: number[]): number {
  if (valoresGrupo.length === 0) return 100;
  const menores = valoresGrupo.filter((v) => v < valorPropio).length;
  return Math.round((menores / valoresGrupo.length) * 100);
}
