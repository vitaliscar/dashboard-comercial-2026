"use client";

import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-catalogos";
import { unidadLabelInfo } from "@/lib/unidad-labels";

const ROUTE_BY_UNIT_LABEL: Record<string, string> = {
  Servicios: "/servicios",
  "Lub / Filtros": "/lubfiltros",
  Equipos: "/equipos",
  Alquiler: "/alquiler",
  Repuestos: "/repuestos",
};

function getDashboardRoute(
  role: ReturnType<typeof useAuth>["role"],
  assignedUnitIds: string[],
  units: Array<{ id: string; nombre: string }> | undefined,
): string | null {
  switch (role) {
    case "gerencia":
      return "/gerencia-nacional";
    case "coordinador":
      return "/coordinador";
    case "asesor":
      return "/asesor";
    case "gerente_comercial": {
      if (assignedUnitIds.length !== 1) return "/gerencia-nacional";
      const assignedUnit = units?.find((unit) => unit.id === assignedUnitIds[0]);
      return assignedUnit
        ? ROUTE_BY_UNIT_LABEL[unidadLabelInfo(assignedUnit.nombre).label] ?? "/gerencia-nacional"
        : "/gerencia-nacional";
    }
    default:
      return null;
  }
}

/**
 * Client-side dashboard entrypoint for the Vite + Express + wouter app.
 * Destination selection stays in the browser because auth/profile data arrives
 * through useAuth(), not through Next.js Server Components.
 */
export default function DashboardPage() {
  const [location, setLocation] = useLocation();
  const { session, profile, role, loading } = useAuth();
  const { data: units, isLoading: unitsLoading } = useUnidades();
  const assignedUnitIds = profile?.unidades_negocio_ids ?? [];
  const waitingForUnitCatalog =
    role === "gerente_comercial" && assignedUnitIds.length === 1 && unitsLoading;

  const destination = useMemo(
    () => (waitingForUnitCatalog ? null : getDashboardRoute(role, assignedUnitIds, units)),
    [role, assignedUnitIds, units, waitingForUnitCatalog],
  );

  useEffect(() => {
    if (!loading && session && destination && location !== destination) {
      setLocation(destination);
    }
  }, [destination, loading, location, session, setLocation]);

  if (loading) {
    return (
      <div className="card-elevated mx-auto mt-8 max-w-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">Validando tu sesión…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card-elevated mx-auto mt-8 max-w-xl p-8 text-center">
        <h2 className="font-display text-xl font-semibold">Dashboard requiere una sesión</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El modo demo se muestra desde la entrada pública del dashboard.
        </p>
      </div>
    );
  }

  if (waitingForUnitCatalog) {
    return (
      <div className="card-elevated mx-auto mt-8 max-w-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">Cargando tus unidades asignadas…</p>
      </div>
    );
  }

  if (!role || !destination) {
    return (
      <div className="card-elevated mx-auto mt-8 max-w-xl p-8 text-center">
        <h2 className="font-display text-xl font-semibold">No se pudo determinar tu rol</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Contacta al administrador para revisar los permisos de tu cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="card-elevated mx-auto mt-8 max-w-xl p-8 text-center" role="status">
      <h2 className="font-display text-xl font-semibold">Preparando tu dashboard</h2>
      <p className="mt-2 text-sm text-muted-foreground">Redirigiendo a {destination}…</p>
    </div>
  );
}
