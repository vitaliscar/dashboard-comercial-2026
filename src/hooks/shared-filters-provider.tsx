import { useEffect, useState, type ReactNode } from "react";
import { SharedFilters, defaultFilters, loadFilters, saveFilters } from "@/lib/shared-filters";
import { SharedFiltersCtx } from "@/hooks/shared-filters-context";

export function SharedFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<SharedFilters>(() => loadFilters());

  // Sync saved filters from storage after client hydration completes
  useEffect(() => {
    const saved = loadFilters();
    setFiltersState(saved);
  }, []);

  const setFilters = (patch: Partial<SharedFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...patch };
      saveFilters(next);
      return next;
    });
  };

  return (
    <SharedFiltersCtx.Provider value={{ filters, setFilters }}>
      {children}
    </SharedFiltersCtx.Provider>
  );
}
