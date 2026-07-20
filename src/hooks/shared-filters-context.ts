import { createContext } from "react";
import type { SharedFilters } from "@/lib/shared-filters";

interface SharedFiltersContextValue {
  filters: SharedFilters;
  setFilters: (patch: Partial<SharedFilters>) => void;
}

export const SharedFiltersCtx = createContext<SharedFiltersContextValue | undefined>(undefined);
