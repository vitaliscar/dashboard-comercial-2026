import { useQuery } from "@tanstack/react-query";
import { getSucursalesFn, getUnidadesFn } from "@/lib/server/catalogos";

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
    queryFn: () => getSucursalesFn(),
    staleTime: Infinity,
  });
}

export function useUnidades() {
  return useQuery({
    queryKey: ["unidades"],
    queryFn: () => getUnidadesFn(),
    staleTime: Infinity,
  });
}
