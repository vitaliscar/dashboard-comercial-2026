// Cache formatters at module level for performance
const nfMoney = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const nfInt = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export function money(n: number | null | undefined): string {
  return `$${nfMoney.format(Number(n ?? 0))}`;
}

export function moneyShort(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const absVal = Math.abs(v);
  if (absVal >= 1_000_000) return `$${nfInt.format(v / 1_000_000)}M`;
  if (absVal >= 1_000) return `$${nfInt.format(v / 1_000)}k`;
  return `$${nfInt.format(v)}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  return `${(Number(n ?? 0)).toFixed(digits)}%`;
}

export function int(n: number | null | undefined): string {
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

// Cache normalized city names for faster lookups
const SUCURSAL_MAP: Record<string, string> = {
  "puerto ordaz": "PZO",
  "pzo": "PZO",
  "puerto la cruz": "PLC",
  "plc": "PLC",
  "barquisimeto": "BQT",
  "bqt": "BQT",
  "valencia": "VAL",
  "val": "VAL",
  "caracas": "CCS",
  "ccs": "CCS",
  "maracaibo": "MCB",
  "mcb": "MCB",
  "punto fijo": "PF",
  "pf": "PF",
  "fmo piar": "PIAR",
  "piar": "PIAR",
  "maturin": "MAT",
  "mat": "MAT",
};

export function abbreviateSucursal(name: string | null | undefined): string {
  if (!name) return "";
  const normalized = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return SUCURSAL_MAP[normalized] ?? name.slice(0, 3).toUpperCase();
}
