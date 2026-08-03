"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getAllMonthsCap } from "@/lib/date-range";
import { canAccessModule } from "@/lib/permissions";
import { getClientesPotencialesDetalleAction } from "@/lib/actions/mercadeo";
import { CanalesSection } from "@/components/mercadeo/CanalesSection";
import { InstagramSection } from "@/components/mercadeo/InstagramSection";
import { GoogleBusinessSection } from "@/components/mercadeo/GoogleBusinessSection";
import { PostHistoriasSection } from "@/components/mercadeo/PostHistoriasSection";
import { LeadsKpis } from "@/components/mercadeo/LeadsKpis";
import { LeadsEmbudo } from "@/components/mercadeo/LeadsEmbudo";
import { LeadsTable } from "@/components/mercadeo/LeadsTable";
import { computeEmbudoEstatus, computeLeadsResumen } from "@/lib/analytics/clientes-potenciales";

export default function MercadeoPage() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const canView = canAccessModule(role, "mercadeo");

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses });
  };

  const { data: leads } = useQuery({
    queryKey: ["clientes-potenciales-detalle", anio, JSON.stringify(meses)],
    queryFn: () => getClientesPotencialesDetalleAction({ anio, meses }),
    enabled: canView,
  });

  // Los KPIs y el embudo de esta página se derivan del mismo detalle ya
  // cargado — no se pide otra vez al servidor.
  const resumen = useMemo(() => computeLeadsResumen(leads ?? []), [leads]);
  const embudo = useMemo(() => computeEmbudoEstatus(leads ?? []), [leads]);

  // Guard DESPUÉS de todos los hooks (ver CLAUDE.md: "hooks después de un
  // early return").
  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader
          eyebrow="Mercadeo"
          title="Acceso restringido"
          description="Este módulo es exclusivo de Gerencia Nacional."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        eyebrow="Mercadeo"
        title="Panorama de Mercadeo"
        description="Canales digitales, Google My Business, publicaciones y clientes potenciales"
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        defaultAnio={anio}
        defaultMes={meses ?? Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1)}
      />

      <CanalesSection meses={meses} />
      <InstagramSection meses={meses} />
      <GoogleBusinessSection meses={meses} />
      <PostHistoriasSection meses={meses} />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Clientes Potenciales</h2>
        <LeadsKpis resumen={resumen} />
        <LeadsEmbudo data={embudo} />
        <LeadsTable rows={leads ?? []} />
      </section>
    </div>
  );
}
