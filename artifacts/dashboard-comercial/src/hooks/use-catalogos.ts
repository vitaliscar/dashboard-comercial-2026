"use client";

import { useQuery } from "@tanstack/react-query";
import { getCatalogosData } from "@/lib/api-data";
import { unidadLabelInfo } from "@/lib/unidad-labels";

/**
 * Catálogos casi inmutables (solo cambian vía /carga o /usuarios). staleTime
 * Infinity evita re-fetch en cada ruta; queryClient.invalidateQueries() tras
 * una carga de Excel los refresca igual (invalidate ignora staleTime).
 *
 * Antes de este hook, cada ruta declaraba su propia query con la misma
 * queryKey ["sucursales"]/["unidades"] pero `select()` distinto (algunas
 * "*", otras "id, nombre") — React Query cachea por key sin importar el
 * shape, así que la primera ruta en montar "ganaba" el caché para todas las
 * demás. Centralizar el select en un solo hook elimina ese bug latente.
 */
function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos"],
    queryFn: getCatalogosData,
    staleTime: Infinity,
  });
}

export function useSucursales() {
  const query = useCatalogos();
  return { ...query, data: query.data?.sucursales };
}

/**
 * Igual que useSucursales pero incluye las sucursales ocultas del sistema
 * (San Cristóbal). queryKey distinta a propósito: si compartiera
 * ["sucursales"] contaminaría el caché del resto de las rutas.
 */
export function useSucursalesMercadeo() {
  const query = useCatalogos();
  return { ...query, data: query.data?.sucursales };
}

/**
 * Orden fijo en TODO el sistema: Repuestos, Lub / Filtros, Servicios,
 * Equipos, Alquiler (unidadLabelInfo().order) — no el orden alfabético que
 * devuelve la query de Postgres.
 */
export function useUnidades() {
  const query = useCatalogos();
  return {
    ...query,
    data: query.data?.unidades
      ? [...query.data.unidades].sort(
        (a, b) => unidadLabelInfo(a.nombre).order - unidadLabelInfo(b.nombre).order,
      )
      : undefined,
  };
}
