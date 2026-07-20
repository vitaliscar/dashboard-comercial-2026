import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { money, pct } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Calculator, TrendingUp, Target } from "lucide-react";

export const Route = createFileRoute("/_app/simulador")({
  head: () => ({ meta: [{ title: "Simulador de Presupuesto · CCV" }] }),
  component: SimuladorPage,
});

interface SimRow {
  id: string;
  anio: number;
  mes: number;
  venta: number;
  presupuesto: number;
  unidad_negocio_id: string | null;
  sucursal_id: string | null;
}

function SimuladorPage() {
  const { role, profile, user } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const { data: unidades } = useUnidades();

  const [crecimiento, setCrecimiento] = useState([10]);
  const [conversion, setConversion] = useState([25]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: rows } = useQuery({
    queryKey: ["simulador", "cumplimiento", role, profile?.id, anio, meses, selectedUnidades],
    queryFn: async () => {
      let q = supabase.from("cumplimiento_asesores").select("*").eq("anio", anio);

      if (meses !== "all") {
        q = q.in("mes", meses);
      }

      if (selectedUnidades && selectedUnidades.length > 0) {
        q = q.in("unidad_negocio_id", selectedUnidades);
      }

      q = scoped(q, role, profile, user?.id, {
        sucursal: "sucursal_id",
        unidad: "unidad_negocio_id",
        asesor: "asesor_id",
      });

      const data = await fetchAllRows<SimRow>(() => q);
      return data ?? [];
    },
  });

  const base = useMemo(() => {
    const venta = (rows ?? []).reduce((acc, r) => acc + r.venta, 0);
    const presupuesto = (rows ?? []).reduce((acc, r) => acc + r.presupuesto, 0);
    const cumplimiento = presupuesto > 0 ? venta / presupuesto : 0;
    return { venta, presupuesto, cumplimiento };
  }, [rows]);

  const sim = useMemo(() => {
    const crec = crecimiento[0] / 100;
    const conv = conversion[0] / 100;
    const ventaSim = base.venta * (1 + crec) * (1 + conv * 0.5);
    const presupuestoSim = base.presupuesto * (1 + crec * 0.3);
    const cumplimientoSim = presupuestoSim > 0 ? ventaSim / presupuestoSim : 0;
    return { ventaSim, presupuestoSim, cumplimientoSim };
  }, [base, crecimiento, conversion]);

  const unitOptions = useMemo(() => {
    if (!unidades) return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What-if"
        title="Simulador de Escenarios"
        description="Ajusta supuestos de crecimiento y conversión para ver el impacto proyectado en facturación y cumplimiento."
      />

      <FilterHeader
        defaultAnio={anio}
        defaultMes={meses}
        defaultUnits={selectedUnidades}
        unitOptions={unitOptions}
        onApplyFilters={handleApplyFilters}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 rounded-md border bg-card p-6">
          <h3 className="text-sm font-semibold">Supuestos</h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Crecimiento %</Label>
                <span className="text-sm font-medium">{crecimiento[0]}%</span>
              </div>
              <Slider
                value={crecimiento}
                onValueChange={(value) => setCrecimiento(Array.isArray(value) ? value : [value])}
                min={-20}
                max={50}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tasa de conversión objetivo %</Label>
                <span className="text-sm font-medium">{conversion[0]}%</span>
              </div>
              <Slider
                value={conversion}
                onValueChange={(value) => setConversion(Array.isArray(value) ? value : [value])}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Base</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Facturado" value={money(base.venta)} icon={Calculator} />
            <KpiCard label="Presupuesto" value={money(base.presupuesto)} icon={Target} />
            <KpiCard label="Cumplimiento" value={pct(base.cumplimiento)} icon={TrendingUp} />
          </div>

          <h3 className="text-sm font-semibold">Escenario simulado</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Facturado simulado" value={money(sim.ventaSim)} icon={Calculator} />
            <KpiCard label="Presupuesto simulado" value={money(sim.presupuestoSim)} icon={Target} />
            <KpiCard
              label="Cumplimiento simulado"
              value={pct(sim.cumplimientoSim)}
              icon={TrendingUp}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
