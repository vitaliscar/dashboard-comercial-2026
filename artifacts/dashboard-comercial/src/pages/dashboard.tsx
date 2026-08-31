import { useLocation } from "wouter";
import { getCurrentSession } from "@/lib/actions/auth";
import { unidadId, type UnidadKey } from "@/lib/server/unidades";

// Ruta dedicada por unidad. Los IDs se resuelven por nombre contra la BD: no
// son estables entre cargas del Excel (defaultRandom), y hardcodearlos hacía
// que ningún GC llegara nunca a su vista de unidad.
const ROUTE_BY_UNIDAD: Record<UnidadKey, string> = {
  servicios: "/servicios",
  lubfiltros: "/lubfiltros",
  equipos: "/equipos",
  alquiler: "/alquiler",
  repuestos: "/repuestos",
};

async function unitRoute(unidadNegocioId: string): Promise<string | null> {
  for (const key of Object.keys(ROUTE_BY_UNIDAD) as UnidadKey[]) {
    if ((await unidadId(key)) === unidadNegocioId) return ROUTE_BY_UNIDAD[key];
  }
  return null;
}

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
      break;

    case "gerente_comercial": {
      const units = profile.unidadesNegocioIds ?? [];
      const route = units.length === 1 ? await unitRoute(units[0]) : null;
      if (route) redirect(route);
      redirect("/gerencia-nacional");
      break;
    }

    case "coordinador":
      redirect("/coordinador");
      break;

    case "asesor":
      redirect("/asesor");
      break;

    default:
      return (
        <div className="p-6 text-sm text-muted-foreground">
          No se pudo determinar tu rol. Contacta al administrador.
        </div>
      );
  }
}
