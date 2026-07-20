export const STORAGE_KEY = "ccv-shared-filters";

export interface SharedFilters {
  anio: number;
  meses: number[] | "all";
  sucursales: string[];
  unidades: string[];
}

export function defaultFilters(): SharedFilters {
  const now = new Date();
  return { anio: now.getFullYear(), meses: [now.getMonth() + 1], sucursales: [], unidades: [] };
}

export function loadFilters(): SharedFilters {
  if (typeof window === "undefined") return defaultFilters();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultFilters();
    return { ...defaultFilters(), ...JSON.parse(raw) };
  } catch {
    return defaultFilters();
  }
}

/** Clears the persisted cross-module filter selection (call on sign-out). */
export function clearSharedFilters() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
