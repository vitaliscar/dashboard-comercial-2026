import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  SharedFilters,
  defaultFilters,
  loadFilters,
  saveFilters,
  currentMonthFilter,
  STORAGE_KEY,
} from "@/lib/shared-filters";
import { SharedFiltersCtx } from "@/hooks/shared-filters-context";

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  // Estado inicial determinístico (sin "mes actual") — debe coincidir entre
  // SSR y la primera pintada del cliente. Ver defaultFilters().
  const [filters, setFiltersState] = useState<SharedFilters>(() => defaultFilters());

  // Después del montaje (solo cliente): si hay filtros guardados, aplicarlos.
  // Si es la primera visita (sin nada guardado), recién aquí se calcula el mes
  // actual con el reloj del navegador — nunca durante SSR/la primera pintada.
  useEffect(() => {
    const hasStored =
      typeof window !== "undefined" &&
      (localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY));
    if (hasStored) {
      setFiltersState(loadFilters());
    } else {
      setFiltersState((prev) => ({ ...prev, meses: currentMonthFilter() }));
    }
  }, []);

  const setFilters = useCallback((patch: Partial<SharedFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      saveFilters(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ filters, setFilters }), [filters, setFilters]);

  return <SharedFiltersCtx.Provider value={value}>{children}</SharedFiltersCtx.Provider>;
}
