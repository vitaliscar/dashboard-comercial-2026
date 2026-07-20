import type { UserProfile, AppRole } from "@/hooks/use-auth";

/**
 * Apply role-based scoping to a supabase select query builder.
 * RLS also enforces this on the server; this is a UX-level shortcut.
 */
export function scoped<T>(
  q: T,
  role: AppRole | null,
  profile: UserProfile | null,
  userId: string | undefined,
  cols: { sucursal?: string; unidad?: string; asesor?: string } = {},
): T {
  const qb = q as unknown as {
    eq: (c: string, v: string) => typeof qb;
    in: (c: string, v: string[]) => typeof qb;
  };
  if (!role || !profile) return q;
  if (role === "gerencia") return q;
  if (role === "gerente_comercial" && cols.unidad) {
    const unIds =
      profile.unidades_negocio_ids && profile.unidades_negocio_ids.length > 0
        ? profile.unidades_negocio_ids
        : profile.unidad_negocio_id
          ? [profile.unidad_negocio_id]
          : [];
    if (unIds.length > 0) {
      return qb.in(cols.unidad, unIds) as unknown as T;
    }
  }
  if (role === "coordinador" && profile.sucursal_id && cols.sucursal) {
    return qb.eq(cols.sucursal, profile.sucursal_id) as unknown as T;
  }
  if (role === "asesor" && userId && cols.asesor) {
    return qb.eq(cols.asesor, userId) as unknown as T;
  }
  return q;
}
