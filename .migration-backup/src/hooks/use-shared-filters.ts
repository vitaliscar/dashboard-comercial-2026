import { useContext } from "react";
import { SharedFiltersCtx } from "@/hooks/shared-filters-context";

/**
 * Cross-module filter selection (mes/año/sucursal/unidad): set on any dashboard page,
 * read by every other one, persisted per-tab so it survives navigation and reloads
 * until the user picks something else or signs out.
 */
export function useSharedFilters() {
  const ctx = useContext(SharedFiltersCtx);
  if (!ctx) throw new Error("useSharedFilters must be used within SharedFiltersProvider");
  return ctx;
}
