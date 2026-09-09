import type { Queryable } from "../routes/auth";

export type ColumnaAjuste = "ccv" | "xibi" | "estrategico" | "total";

export interface AjusteRow {
  sucursalId: string | null;
  unidadNegocioId: string | null;
  mes: number;
  columna: ColumnaAjuste;
  monto: number;
}

/** Trae los ajustes manuales del año dado, listos para sumarlos en memoria. */
export async function cargarAjustesManuales(tx: Queryable, anio: number): Promise<AjusteRow[]> {
  const { rows } = await tx.query(
    `SELECT sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId",
            mes, columna, monto
     FROM ajustes_manuales WHERE anio = $1`,
    [anio],
  );
  return rows.map((r) => ({
    sucursalId: r.sucursalId,
    unidadNegocioId: r.unidadNegocioId,
    mes: r.mes,
    columna: (r.columna ?? "total") as ColumnaAjuste,
    monto: Number(r.monto),
  }));
}

/** Suma los ajustes que aplican a una combinación mes+sucursal+unidad+columna (null = comodín). */
export function sumaAjuste(
  ajustes: AjusteRow[],
  params: { mes: number; sucursalId: string | null; unidadNegocioId: string | null; columna: ColumnaAjuste },
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

interface PresupuestoAjustable {
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  ventasCcv: string | null;
  ventasXibi: string | null;
  ventasEstrategicas: string | null;
}

/**
 * Devuelve copias de las filas de `presupuestos` con los ajustes manuales ya
 * sumados a ventasCcv/ventasXibi/ventasEstrategicas ("total" se suma sobre
 * CCV por convención -- no hay columna "total" separada en la tabla).
 */
export function aplicarAjustesAPresupuestos<T extends PresupuestoAjustable>(rows: T[], ajustes: AjusteRow[]): T[] {
  if (ajustes.length === 0) return rows;
  return rows.map((row) => ({
    ...row,
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
