import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · CCV" }] }),
  component: Dashboard,
});

// Map from canonical unit ID to specific route. Repuestos has no dedicated route — a
// Repuestos-only GC (e.g. Abrahan Chavez) falls through to /gerencia-nacional, same as
// any multi-unit GC, filtered to their assigned unit via the unit chip selector.
const UNIT_TO_ROUTE: Record<string, string> = {
  "9c322ad9-75af-4f88-912e-182e708264d3": "/servicios",
  "bd01d86c-c8a5-488a-9afc-141d242b9325": "/lubfiltros",
  "78e09e03-c1aa-4ed5-8755-8310102f5220": "/equipos",
  "825146fc-ab6d-4f9c-97d4-2078f3e67549": "/alquiler",
};

/**
 * Dashboard Home - detects user role and redirects to appropriate page
 *
 * Role-based routing:
 * - Gerencia → /gerencia-nacional (full dashboard view)
 * - Gerente Comercial (multi-unit) → /gerencia-nacional
 * - Gerente Comercial (single-unit) → unit-specific route (/servicios, /equipos, etc.)
 * - Coordinador → /coordinador (panel financiero de toda su sucursal)
 * - Asesor → /asesor (vista personal)
 *
 * While loading, displays a centered spinner with loading message.
 */
function Dashboard() {
  const navigate = useNavigate();
  const { role, profile, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Wait for auth to load
    if (loading) return;

    setRedirecting(true);

    // Route based on role
    switch (role) {
      case "gerencia":
        navigate({ to: "/gerencia-nacional" });
        break;

      case "gerente_comercial": {
        const units = profile?.unidades_negocio_ids ?? [];
        if (units.length === 1 && UNIT_TO_ROUTE[units[0]]) {
          // Single-unit GC → go directly to their unit dashboard
          navigate({ to: UNIT_TO_ROUTE[units[0]] as never });
        } else {
          // Multi-unit GC or fallback → general commercial view
          navigate({ to: "/gerencia-nacional" });
        }
        break;
      }

      case "coordinador":
        // Coordinador always sees the full-sucursal financial panel (all units,
        // scoped to their own branch). Only Gerente Comercial is unit-locked.
        navigate({ to: "/coordinador" });
        break;

      case "asesor":
        navigate({ to: "/asesor" });
        break;

      default:
        // No valid role, stay on dashboard (shouldn't happen)
        setRedirecting(false);
    }
  }, [role, profile, loading, navigate]);

  // Show loading spinner while auth is loading or redirecting
  if (loading || redirecting) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center flex flex-col gap-4">
          <Loader2 className="size-12 animate-spin mx-auto text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Detectando tu rol...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Un momento, estamos preparando tu vista personalizada
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
