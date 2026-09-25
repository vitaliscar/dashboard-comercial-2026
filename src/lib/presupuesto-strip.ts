import { unidadLabelInfo } from "@/lib/unidad-labels";

export interface PresupuestoRow {
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  meta: string | number | null;
  facturado: string | number | null;
}

export interface UnidadRef {
  id: string;
  nombre: string;
}

export interface PresupuestoUnidad {
  id: string;
  label: string;
  order: number;
  meta: number;
  facturado: number;
  pct: number;
}

export interface PresupuestoResumen {
  unidades: PresupuestoUnidad[];
  total: { meta: number; facturado: number; pct: number };
}

const pctOf = (facturado: number, meta: number) => (meta > 0 ? (facturado / meta) * 100 : 0);

/**
 * Presupuesto (meta) y facturado por unidad de negocio, filtrado por meses y
 * sucursales (lista vacía = todas). Solo devuelve unidades con datos: RLS ya
 * recorta lo que el rol puede ver, así que un gerente de una unidad recibe una.
 */
export function agruparPresupuestoPorUnidad(
  rows: PresupuestoRow[],
  filtros: { meses: number[]; sucursalIds: string[] },
  unidades: UnidadRef[],
): PresupuestoResumen {
  const acc = new Map<string, { meta: number; facturado: number }>();
  for (const r of rows) {
    if (!r.unidadNegocioId || !filtros.meses.includes(r.mes)) continue;
    const sucursalOk =
      filtros.sucursalIds.length === 0 ||
      (r.sucursalId !== null && filtros.sucursalIds.includes(r.sucursalId));
    if (!sucursalOk) continue;
    const a = acc.get(r.unidadNegocioId) ?? { meta: 0, facturado: 0 };
    a.meta += Number(r.meta ?? 0);
    a.facturado += Number(r.facturado ?? 0);
    acc.set(r.unidadNegocioId, a);
  }

  const lista = unidades
    .map((u) => {
      const a = acc.get(u.id) ?? { meta: 0, facturado: 0 };
      const info = unidadLabelInfo(u.nombre);
      return {
        id: u.id,
        label: info.label,
        order: info.order,
        ...a,
        pct: pctOf(a.facturado, a.meta),
      };
    })
    .filter((u) => u.meta > 0 || u.facturado > 0)
    .sort((a, b) => a.order - b.order);

  const meta = lista.reduce((s, u) => s + u.meta, 0);
  const facturado = lista.reduce((s, u) => s + u.facturado, 0);
  return { unidades: lista, total: { meta, facturado, pct: pctOf(facturado, meta) } };
}
