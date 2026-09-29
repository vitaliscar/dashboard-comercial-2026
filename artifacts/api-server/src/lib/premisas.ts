export type PremisaTipo = "crecimiento_pct" | "ajuste_fijo";
export type PremisaAlcance = "global" | "unidad" | "sucursal" | "mes";

export interface Premisa {
  tipo: PremisaTipo;
  alcance: PremisaAlcance;
  alcanceId: string | null;
  mes: number | null;
  valor: number;
}

export interface FilaBase {
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  base: number;
}

const PCT_MIN = -100;
const PCT_MAX = 500;
const FIJO_MAX = 1_000_000_000;
const MAX_PREMISAS = 100;

const TIPOS: PremisaTipo[] = ["crecimiento_pct", "ajuste_fijo"];
const ALCANCES: PremisaAlcance[] = ["global", "unidad", "sucursal", "mes"];

/** Valida y normaliza premisas recibidas del cliente; descarta filas inválidas
 * en vez de fallar toda la request (una premisa mal formada no debe tumbar
 * el resto del cálculo). */
export function validarPremisas(input: unknown): Premisa[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r): Premisa => ({
      tipo: TIPOS.includes(r["tipo"] as PremisaTipo) ? (r["tipo"] as PremisaTipo) : "crecimiento_pct",
      alcance: ALCANCES.includes(r["alcance"] as PremisaAlcance) ? (r["alcance"] as PremisaAlcance) : "global",
      alcanceId: typeof r["alcanceId"] === "string" ? r["alcanceId"] : null,
      mes:
        Number.isInteger(r["mes"]) && (r["mes"] as number) >= 1 && (r["mes"] as number) <= 12
          ? (r["mes"] as number)
          : null,
      valor: Number.isFinite(r["valor"]) ? Number(r["valor"]) : 0,
    }))
    .filter((p) =>
      p.tipo === "crecimiento_pct" ? p.valor >= PCT_MIN && p.valor <= PCT_MAX : Math.abs(p.valor) <= FIJO_MAX,
    )
    .filter((p) => (p.alcance === "unidad" || p.alcance === "sucursal" ? !!p.alcanceId : true))
    .filter((p) => (p.alcance === "mes" ? p.mes !== null : true))
    .slice(0, MAX_PREMISAS);
}

/** Construye una premisa global única a partir del crecimientoPct legado, para
 * mantener compatibilidad con clientes que todavía no mandan `premisas[]`. */
export function premisaGlobalLegacy(crecimientoPct: number): Premisa[] {
  return [{ tipo: "crecimiento_pct", alcance: "global", alcanceId: null, mes: null, valor: crecimientoPct }];
}

/** Aplica las premisas en cascada sobre una fila base: todos los % que
 * apliquen (global + overrides por unidad/sucursal/mes) se SUMAN entre sí
 * antes de aplicarse una sola vez; los ajustes fijos se suman en monto
 * después del %. Así "global +5%" y "unidad Repuestos +3%" da +8% en
 * Repuestos y +5% en el resto, sin pisarse entre sí. */
export function aplicarPremisas(fila: FilaBase, premisas: Premisa[]): number {
  let pct = 0;
  let fijo = 0;
  for (const p of premisas) {
    const aplica =
      p.alcance === "global" ||
      (p.alcance === "unidad" && p.alcanceId === fila.unidadNegocioId) ||
      (p.alcance === "sucursal" && p.alcanceId === fila.sucursalId) ||
      (p.alcance === "mes" && p.mes === fila.mes);
    if (!aplica) continue;
    if (p.tipo === "crecimiento_pct") pct += p.valor;
    else fijo += p.valor;
  }
  const sugerido = fila.base * (1 + pct / 100) + fijo;
  return Math.max(0, Math.round(sugerido * 100) / 100);
}
