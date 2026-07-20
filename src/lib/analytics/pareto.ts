export interface ParetoInputRow {
  key: string;
  monto: number;
}

export interface ParetoRow {
  nombre: string;
  monto: number;
  share: number;
  acumulado: number;
  clasificacion: "A" | "B" | "C";
}

export interface ParetoSummary {
  rows: ParetoRow[];
  totalGeneral: number;
  top20Count: number;
  top20Sum: number;
  top20Share: number;
  vitales: number;
}

export function computeParetoSummary(input: ParetoInputRow[]): ParetoSummary {
  const map = new Map<string, number>();
  input.forEach((r) => {
    const k = r.key || "Sin dato";
    map.set(k, (map.get(k) ?? 0) + Number(r.monto));
  });
  const arr = Array.from(map, ([nombre, monto]) => ({ nombre, monto })).sort(
    (a, b) => b.monto - a.monto,
  );
  const total = arr.reduce((a, b) => a + b.monto, 0);
  let acc = 0;
  const rows: ParetoRow[] = arr.map((r) => {
    acc += r.monto;
    const acumulado = total ? (acc / total) * 100 : 0;
    const clasificacion: "A" | "B" | "C" = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";
    return {
      ...r,
      share: total ? (r.monto / total) * 100 : 0,
      acumulado,
      clasificacion,
    };
  });

  const totalGeneral = rows.reduce((a, b) => a + b.monto, 0);
  const top20Count = Math.max(1, Math.ceil(rows.length * 0.2));
  const top20Sum = rows.slice(0, top20Count).reduce((a, b) => a + b.monto, 0);
  const top20Share = totalGeneral ? (top20Sum / totalGeneral) * 100 : 0;
  const vitales = rows.filter((r) => r.acumulado <= 80).length || Math.min(1, rows.length);

  return { rows, totalGeneral, top20Count, top20Sum, top20Share, vitales };
}
