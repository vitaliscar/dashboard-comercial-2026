import { useEffect, useState, type ReactNode } from "react";
import { SharedFilters, loadFilters, STORAGE_KEY } from "@/lib/shared-filters";
import { SharedFiltersCtx } from "@/hooks/shared-filters-context";

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<SharedFilters>(() => loadFilters());

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const setFilters = (patch: Partial<SharedFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  };

  return (
    <SharedFiltersCtx.Provider value={{ filters, setFilters }}>
      {children}
    </SharedFiltersCtx.Provider>
  );
}
