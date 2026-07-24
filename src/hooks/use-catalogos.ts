"use client";

import { useQuery } from "@tanstack/react-query";
import { getSucursalesAction, getUnidadesAction } from "@/lib/actions/catalogos";

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
export function useSucursales() {
  return useQuery({
    queryKey: ["sucursales"],
    queryFn: () => getSucursalesAction(),
    staleTime: Infinity,
  });
}

export function useUnidades() {
  return useQuery({
    queryKey: ["unidades"],
    queryFn: () => getUnidadesAction(),
    staleTime: Infinity,
  });
}
