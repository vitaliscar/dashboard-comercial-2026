export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EvaluationPoint = { mes: number; venta: number; presupuesto: number };
export type MarcaRow = { marca: string; monto: number };

export function year(value: unknown): number | null {
  const parsed = Number(value ?? new Date().getUTCFullYear());
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200 ? parsed : null;
}

export function id(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

export function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function score(puntos: EvaluationPoint[], ticketPropio: number, ticketPromedioGrupo: number) {
  const venta = puntos.reduce((total, point) => total + point.venta, 0);
  const presupuesto = puntos.reduce((total, point) => total + point.presupuesto, 0);
  const cumplimiento = presupuesto > 0 ? Math.min(100, Math.max(0, (venta / presupuesto) * 100)) : 0;
  const datos = puntos.filter((point) => point.presupuesto > 0).sort((a, b) => a.mes - b.mes);
  const tendencia = datos.length < 2
    ? 50
    : Math.min(100, Math.max(0, 50 + (((datos.at(-1)!.venta / datos.at(-1)!.presupuesto) * 100 - (datos[0].venta / datos[0].presupuesto) * 100) / 20) * 50));
  const ticket = ticketPromedioGrupo <= 0
    ? 50
    : Math.min(100, Math.max(0, (ticketPropio / ticketPromedioGrupo) * 50));
  const total = Math.round(cumplimiento * 0.5 + tendencia * 0.3 + ticket * 0.2);
  return { score: total, cumplimiento, tendencia, ticket, banda: total >= 90 ? "success" : total >= 50 ? "warning" : "danger" };
}

export function percentile(own: number, peers: number[]) {
  return peers.length === 0 ? null : Math.round((peers.filter((value) => value < own).length / peers.length) * 100);
}

export function parseIntList(value: unknown): number[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
}

export function parseIdList(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").filter((value) => UUID_RE.test(value));
}

export function agruparMarca(rows: { marca: string; monto: number }[]): MarcaRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.marca, (totals.get(row.marca) ?? 0) + number(row.monto));
  return [...totals.entries()]
    .map(([marca, monto]) => ({ marca, monto }))
    .sort((a, b) => b.monto - a.monto);
}
