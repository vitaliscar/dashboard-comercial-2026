import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ajustesManuales } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ColumnaAjuste = "ccv" | "xibi" | "estrategico" | "total";

export interface AjusteFila {
  sucursalId: string | null;
  unidadNegocioId: string | null;
  mes: number;
  columna: ColumnaAjuste;
  monto: number;
}

/** Trae los ajustes manuales del año dado (todos los meses) para aplicarlos en memoria. */
export async function cargarAjustesManuales(tx: Tx, anio: number, meses?: number[]): Promise<AjusteFila[]> {
  const rows = await tx
    .select({
      sucursalId: ajustesManuales.sucursalId,
      unidadNegocioId: ajustesManuales.unidadNegocioId,
      mes: ajustesManuales.mes,
      columna: ajustesManuales.columna,
      monto: ajustesManuales.monto,
    })
    .from(ajustesManuales)
    .where(
      meses && meses.length > 0
        ? and(eq(ajustesManuales.anio, anio), inArray(ajustesManuales.mes, meses))
        : eq(ajustesManuales.anio, anio),
    );

  return rows.map((r) => ({
    sucursalId: r.sucursalId,
    unidadNegocioId: r.unidadNegocioId,
    mes: r.mes,
    columna: r.columna as ColumnaAjuste,
    monto: Number(r.monto),
  }));
}

/**
 * Suma los ajustes que aplican a una combinación sucursal+unidad+mes+columna.
 * sucursalId/unidadNegocioId nulos en el ajuste = comodín (aplica a todas).
 */
interface PresupuestoConAjustable {
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  ventasCcv: string | null;
  ventasXibi: string | null;
  ventasEstrategicas: string | null;
}

/**
 * Devuelve una copia de las filas de `presupuestos` con los ajustes manuales
 * ya sumados a ventasCcv/ventasXibi/ventasEstrategicas. Usar siempre que se
 * lean estas columnas para un reporte -- los ajustes viven aparte para
 * sobrevivir a la re-carga automática, pero deben reflejarse en pantalla.
 */
export function aplicarAjustesAPresupuestos<T extends PresupuestoConAjustable>(
  rows: T[],
  ajustes: AjusteFila[],
): T[] {
  if (ajustes.length === 0) return rows;
  return rows.map((row) => ({
    ...row,
    // "total" se suma sobre CCV -- no hay un campo "total" separado en
    // `presupuestos` (los reportes lo derivan sumando ccv+xibi+estrategico),
    // así que un ajuste sin columna específica cae en CCV por convención.
    ventasCcv: String(
      Number(row.ventasCcv ?? 0) +
        sumaAjuste(ajustes, { mes: row.mes, sucursalId: row.sucursalId, unidadNegocioId: row.unidadNegocioId, columna: "ccv" }) +
        sumaAjuste(ajustes, { mes: row.mes, sucursalId: row.sucursalId, unidadNegocioId: row.unidadNegocioId, columna: "total" }),
    ),
    ventasXibi: String(
      Number(row.ventasXibi ?? 0) +
        sumaAjuste(ajustes, { mes: row.mes, sucursalId: row.sucursalId, unidadNegocioId: row.unidadNegocioId, columna: "xibi" }),
    ),
    ventasEstrategicas: String(
      Number(row.ventasEstrategicas ?? 0) +
        sumaAjuste(ajustes, {
          mes: row.mes,
          sucursalId: row.sucursalId,
          unidadNegocioId: row.unidadNegocioId,
          columna: "estrategico",
        }),
    ),
  }));
}

export function sumaAjuste(
  ajustes: AjusteFila[],
  params: { mes: number; sucursalId?: string | null; unidadNegocioId?: string | null; columna: ColumnaAjuste },
): number {
  return ajustes
    .filter(
      (a) =>
        a.mes === params.mes &&
        a.columna === params.columna &&
        (a.sucursalId === null || a.sucursalId === params.sucursalId) &&
        (a.unidadNegocioId === null || a.unidadNegocioId === params.unidadNegocioId),
    )
    .reduce((sum, a) => sum + a.monto, 0);
}
