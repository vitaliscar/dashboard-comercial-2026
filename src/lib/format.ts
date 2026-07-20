const nfMoney = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const nfInt = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `$${nfMoney.format(v)}`;
}
export function moneyShort(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `$${nfInt.format(v / 1_000_000)}M`;
  if (Math.abs(v) >= 1_000) return `$${nfInt.format(v / 1_000)}k`;
  return `$${nfInt.format(v)}`;
}
export function pct(n: number | null | undefined, digits = 1) {
  const v = Number(n ?? 0);
  return `${v.toFixed(digits)}%`;
}
export function int(n: number | null | undefined) {
  return nfInt.format(Number(n ?? 0));
}

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function statusFromPct(p: number): "success" | "warning" | "danger" {
  if (p >= 100) return "success";
  if (p >= 70) return "warning";
  return "danger";
}

/** Same three-band semantics as statusFromPct but with a 90% success threshold
 * (used for compliance heatmaps/rankings where 90%+ reads as "on target"). */
export function statusFromPct90(p: number): "success" | "warning" | "danger" {
  if (p >= 90) return "success";
  if (p >= 70) return "warning";
  return "danger";
}

export function diasEntre(fecha: string | Date, ref: Date = new Date()): number {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return Math.floor((ref.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function roleLabel(r?: string | null): string {
  switch (r) {
    case "gerencia":
      return "Gerencia Nacional";
    case "gerente_comercial":
      return "Gerente Comercial";
    case "coordinador":
      return "Coordinador";
    case "asesor":
      return "Asesor";
    default:
      return "Sin rol";
  }
}

export function abbreviateSucursal(name: string | null | undefined): string {
  if (!name) return "";
  const n = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.includes("puerto ordaz") || n === "pzo") return "PZO";
  if (n.includes("puerto la cruz") || n === "plc") return "PLC";
  if (n.includes("barquisimeto") || n === "bqt") return "BQT";
  if (n.includes("valencia") || n === "val") return "VAL";
  if (n.includes("caracas") || n === "ccs") return "CCS";
  if (n.includes("maracaibo") || n === "mcb") return "MCB";
  if (n.includes("punto fijo") || n === "pf") return "PF";
  if (n.includes("fmo piar") || n === "piar") return "PIAR";
  if (n.includes("maturin") || n === "mat") return "MAT";
  return name.slice(0, 3).toUpperCase();
}
