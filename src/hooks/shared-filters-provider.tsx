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
import { useAuth } from "@/hooks/use-auth";

/**
 * Estado de filtros + hidratación desde localStorage.
 * Se remonta por `key={sessionUserId}` en el wrapper para no heredar
 * filtros del usuario anterior al cambiar de sesión (sin hard refresh).
 */
function SharedFiltersInner({ children }: { children: ReactNode }) {
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

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  // Remount al cambiar de usuario (o logout): el estado en memoria de React
  // sobrevivía al clearSharedFilters() de localStorage y filtraba datos ajenos.
  // Mientras auth carga, un solo key evita montar→desmontar→montar en el boot.
  const scopeKey = loading ? "boot" : (session?.id ?? "anon");
  return <SharedFiltersInner key={scopeKey}>{children}</SharedFiltersInner>;
}
