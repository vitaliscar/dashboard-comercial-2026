import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/actions/auth";

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
 * Dashboard Home — detecta el rol y redirige a la vista correspondiente.
 * Server Component: el guard de /(app)/layout.tsx ya garantiza sesión válida
 * aquí, así que la redirección ocurre antes de renderizar nada (sin spinner
 * de carga como en la versión cliente).
 */
export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/auth");

  const { role, profile } = session;

  switch (role) {
    case "gerencia":
      redirect("/gerencia-nacional");

    case "gerente_comercial": {
      const units = profile.unidadesNegocioIds ?? [];
      if (units.length === 1 && UNIT_TO_ROUTE[units[0]]) {
        redirect(UNIT_TO_ROUTE[units[0]]);
      }
      redirect("/gerencia-nacional");
    }

    case "coordinador":
      redirect("/coordinador");

    case "asesor":
      redirect("/asesor");

    default:
      return (
        <div className="p-6 text-sm text-muted-foreground">
          No se pudo determinar tu rol. Contacta al administrador.
        </div>
      );
  }
}
