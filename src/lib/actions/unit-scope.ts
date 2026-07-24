import "server-only";

// Canonical unidad_negocio_id — mismos valores que dashboard.tsx (UNIT_TO_ROUTE).
export const EQUIPOS_UNIT_ID = "78e09e03-c1aa-4ed5-8755-8310102f5220";
export const ALQUILER_UNIT_ID = "825146fc-ab6d-4f9c-97d4-2078f3e67549";

/**
 * /equipos y /alquiler son la misma vista unificada para un gerente_comercial
 * a cargo de ambas unidades a la vez: si tiene las dos asignadas, ambas páginas
 * deben filtrar por el mismo conjunto combinado (no encerrar cada una a una sola
 * unidad) para mostrar exactamente los mismos datos en las dos rutas.
 *
 * gerencia/coordinador no reciben filtro de unidad aquí — igual que el
 * comportamiento original (unitId="all"), RLS ya limita por sucursal/rol.
 */
export function gcEquiposAlquilerUnitIds(
  role: string | null,
  unidadesNegocioIds: string[],
): string[] | null {
  if (role !== "gerente_comercial") return null;
  const combined = [EQUIPOS_UNIT_ID, ALQUILER_UNIT_ID].filter((id) =>
    unidadesNegocioIds.includes(id),
  );
  return combined.length > 0 ? combined : unidadesNegocioIds;
}
