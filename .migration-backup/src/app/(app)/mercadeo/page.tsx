"use client";

import { useMemo, useState } from "react";
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
import { MercadeoResumenKpis } from "@/components/mercadeo/MercadeoResumenKpis";
import { LeadsKpis } from "@/components/mercadeo/LeadsKpis";
import { LeadsEmbudo } from "@/components/mercadeo/LeadsEmbudo";
import { LeadsOrigenSection } from "@/components/mercadeo/LeadsOrigenSection";
import { LeadsTable } from "@/components/mercadeo/LeadsTable";
import { computeEmbudoEstatus, computeLeadsResumen } from "@/lib/analytics/clientes-potenciales";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const resumen = useMemo(() => computeLeadsResumen(leads ?? []), [leads]);
  const embudo = useMemo(() => computeEmbudoEstatus(leads ?? []), [leads]);
  const [activeTab, setActiveTab] = useState("digital");

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
        description="Presencia digital, publicaciones y embudo de clientes potenciales"
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        defaultAnio={anio}
        defaultMes={meses ?? Array.from({ length: getAllMonthsCap(anio) }, (_, i) => i + 1)}
      />

      <MercadeoResumenKpis anio={anio} meses={meses} leadsTotal={resumen.total} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap gap-1 bg-muted/50 p-1">
          <TabsTrigger value="digital" className="text-xs font-display font-semibold">
            Presencia digital
          </TabsTrigger>
          <TabsTrigger value="leads" className="text-xs font-display font-semibold">
            Clientes potenciales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="digital" className="space-y-4 mt-0">
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <CanalesSection anio={anio} meses={meses} />
            <InstagramSection anio={anio} meses={meses} />
          </div>
          <GoogleBusinessSection meses={meses} />
          <PostHistoriasSection meses={meses} />
        </TabsContent>

        {activeTab === "leads" && (
          <TabsContent value="leads" className="space-y-4 mt-0">
            <LeadsKpis resumen={resumen} />
            <div className="grid gap-4 lg:grid-cols-2">
              <LeadsEmbudo data={embudo} />
              <LeadsOrigenSection rows={leads ?? []} />
            </div>
            <LeadsTable rows={leads ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
