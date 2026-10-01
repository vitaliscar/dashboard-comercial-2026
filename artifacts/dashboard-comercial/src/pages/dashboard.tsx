"use client";

import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-catalogos";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { Button } from "@/components/ui/button";

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
    case "administrador":
    case "gerencia":
      return "/gerencia-nacional";
    case "coordinador":
      return "/coordinador";
    case "asesor":
      return "/asesor";
    case "gerente_comercial": {
      if (assignedUnitIds.length !== 1) return "/resumen";
      const assignedUnit = units?.find((unit) => unit.id === assignedUnitIds[0]);
      return assignedUnit
        ? ROUTE_BY_UNIT_LABEL[unidadLabelInfo(assignedUnit.nombre).label] ?? "/resumen"
        : "/resumen";
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
  const { data: units, isLoading: unitsLoading, isError: unitsError, error: unitsErrorDetail, refetch: retryUnits } = useUnidades();
  const assignedUnitIds = profile?.unidades_negocio_ids?.length
    ? profile.unidades_negocio_ids
    : profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : [];
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

  if (role === "gerente_comercial" && assignedUnitIds.length === 1 && unitsError) {
    return (
      <div className="card-elevated mx-auto mt-8 flex max-w-xl flex-col items-start gap-3 p-8" role="alert">
        <h2 className="font-display text-xl font-semibold">No se pudo cargar tu unidad</h2>
        <p className="text-sm text-muted-foreground">{unitsErrorDetail instanceof Error ? unitsErrorDetail.message : "No se pudo consultar el catálogo de unidades asignadas."}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void retryUnits()}>Reintentar</Button>
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
