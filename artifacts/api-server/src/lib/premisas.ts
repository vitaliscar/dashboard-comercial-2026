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

/**
 * Applies percentage assumptions per row and distributes each fixed adjustment
 * once across the rows covered by its scope. A global fixed adjustment is an
 * annual amount, not an amount repeated for every month/branch/business unit.
 */
export function aplicarPremisasConjunto<T extends FilaBase>(
  filas: T[],
  premisas: Premisa[],
): Array<T & { sugerido: number }> {
  const ajustes = filas.map((fila) => ({ fila, monto: aplicarPremisas(fila, premisas.filter((p) => p.tipo === "crecimiento_pct")) }));
  const adicionales = Array<number>(filas.length).fill(0);

  for (const premisa of premisas) {
    if (premisa.tipo !== "ajuste_fijo") continue;
    const indices = filas.flatMap((fila, i) => {
      const aplica =
        premisa.alcance === "global" ||
        (premisa.alcance === "unidad" && premisa.alcanceId === fila.unidadNegocioId) ||
        (premisa.alcance === "sucursal" && premisa.alcanceId === fila.sucursalId) ||
        (premisa.alcance === "mes" && premisa.mes === fila.mes);
      return aplica ? [i] : [];
    });
    if (indices.length === 0) continue;

    const pesoTotal = indices.reduce((sum, i) => sum + Math.max(0, Number(filas[i]?.base ?? 0)), 0);
    const distribuciones = indices.map((i) => {
      const peso = pesoTotal > 0
        ? Math.max(0, Number(filas[i]?.base ?? 0)) / pesoTotal
        : 1 / indices.length;
      return Math.round(premisa.valor * peso * 100) / 100;
    });
    const residuo = Math.round((premisa.valor - distribuciones.reduce((sum, monto) => sum + monto, 0)) * 100) / 100;
    const ultimo = distribuciones.length - 1;
    if (ultimo >= 0) distribuciones[ultimo] = (distribuciones[ultimo] ?? 0) + residuo;
    indices.forEach((i, posicion) => { adicionales[i] = (adicionales[i] ?? 0) + (distribuciones[posicion] ?? 0); });
  }

  return ajustes.map(({ fila, monto }, i) => ({
    ...fila,
    sugerido: Math.max(0, Math.round((monto + (adicionales[i] ?? 0)) * 100) / 100),
  }));
}
