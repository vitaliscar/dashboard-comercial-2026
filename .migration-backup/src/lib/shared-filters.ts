export const STORAGE_KEY = "ccv-shared-filters";

export interface SharedFilters {
  anio: number;
  meses: number[] | "all";
  sucursales: string[];
  unidades: string[];
}

/**
 * Default determinístico para el primer render (SSR + hidratación del cliente
 * deben coincidir). NO usa el mes actual — `new Date().getMonth()` puede dar
 * un mes distinto en el servidor vs. el navegador si hay diferencia de huso
 * horario/reloj cerca de un cambio de mes, causando un hydration mismatch.
 * El mes actual real se aplica después, client-side, en SharedFiltersProvider.
 */
export function defaultFilters(): SharedFilters {
  const now = new Date();
  return { anio: now.getFullYear(), meses: "all", sucursales: [], unidades: [] };
}

/** Mes actual según el reloj del cliente — llamar solo dentro de useEffect/client-side. */
export function currentMonthFilter(): number[] {
  return [new Date().getMonth() + 1];
}

export function loadFilters(): SharedFilters {
  if (typeof window === "undefined") return defaultFilters();
  try {
    // Prefer localStorage (persists across tabs and browser restarts until sign-out).
    // Fall back to sessionStorage for backwards compatibility.
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultFilters();
    return { ...defaultFilters(), ...JSON.parse(raw) };
  } catch {
    return defaultFilters();
  }
}

export function saveFilters(filters: SharedFilters): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // localStorage might be unavailable (private mode quota), fall back silently
  }
}

/** Clears the persisted cross-module filter selection (call on sign-out). */
export function clearSharedFilters() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}
