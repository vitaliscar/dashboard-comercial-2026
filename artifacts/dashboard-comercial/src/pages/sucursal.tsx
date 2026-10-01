import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { getCoordinadorYear, getSucursalMetrics } from "@/lib/paneles-http";
import { getAllowedMonths } from "@/lib/date-range";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { money, MESES, pct } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";

type UnitPerformance = {
  id: string;
  label: string;
  meta: number;
  facturado: number;
  cumplimiento: number;
};

export default function SucursalPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const [, setLocation] = useLocation();
  const { data: unidades } = useUnidades();
  const singleBranchId = profile?.sucursales_ids?.length === 1
    ? profile.sucursales_ids[0]
    : profile?.sucursal_id ?? undefined;
  const input = {
    anio: filters.anio,
    meses: filters.meses,
    unidades: filters.unidades,
    sucursales: profile?.sucursales_ids ?? (singleBranchId ? [singleBranchId] : []),
  };
  const query = useQuery({
    queryKey: ["sucursal-metrics", input],
    queryFn: () => getSucursalMetrics(input),
    enabled: role === "coordinador",
  });
  const yearInput = { ...input, meses: "all" as const };
  const year = useQuery({
    queryKey: ["coordinador-year-sucursal", yearInput],
    queryFn: () => getCoordinadorYear(yearInput),
    enabled: role === "coordinador",
  });

  const handleApplyFilters = useCallback((next: FilterState) => {
    setFilters({
      anio: next.anio,
      meses: next.meses,
      unidades: next.unidades ?? (next.unidad ? [next.unidad] : []),
    });
  }, [setFilters]);

  const unitRows = useMemo<UnitPerformance[]>(() => {
    if (!year.data) return [];
    const result = new Map<string, UnitPerformance>();
    const selectedMonths = new Set(getAllowedMonths(filters.anio, filters.meses));
    year.data.presupuestos.forEach((row) => {
      if (!selectedMonths.has(Number(row.mes))) return;
      const id = row.unidadNegocioId;
      if (!id || (filters.unidades.length > 0 && !filters.unidades.includes(id))) return;
      const unit = result.get(id) ?? {
        id,
        label: unidadLabelInfo(unidades?.find((item) => item.id === id)?.nombre ?? id).label || "Unidad sin nombre",
        meta: 0,
        facturado: 0,
        cumplimiento: 0,
      };
      unit.meta += Number(row.monto ?? 0);
      unit.facturado += Number(row.ventasCcv ?? 0) + Number(row.ventasXibi ?? 0) + Number(row.ventasEstrategicas ?? 0);
      result.set(id, unit);
    });
    return [...result.values()]
      .map((unit) => ({ ...unit, cumplimiento: unit.meta > 0 ? (unit.facturado / unit.meta) * 100 : 0 }))
      .sort((a, b) => {
        if (a.meta <= 0 && b.meta > 0) return -1;
        if (b.meta <= 0 && a.meta > 0) return 1;
        return Math.max(0, b.meta - b.facturado) - Math.max(0, a.meta - a.facturado);
      });
  }, [filters.anio, filters.meses, filters.unidades, year.data, unidades]);

  const chart = useMemo(() => {
    const byMonth = Array.from({ length: 12 }, (_, index) => ({
      month: MESES[index].slice(0, 3),
      budget: 0,
      sales: 0,
    }));
    year.data?.presupuestos.forEach((row) => {
      if (filters.unidades.length > 0 && (!row.unidadNegocioId || !filters.unidades.includes(row.unidadNegocioId))) return;
      const point = byMonth[Number(row.mes) - 1];
      if (!point) return;
      point.budget += Number(row.monto ?? 0);
      point.sales += Number(row.ventasCcv ?? 0) + Number(row.ventasXibi ?? 0) + Number(row.ventasEstrategicas ?? 0);
    });
    return byMonth;
  }, [filters.unidades, year.data]);

  const totals = {
    meta: Number((!Array.isArray(query.data?.presupuestos) ? query.data?.presupuestos?.totalMonto : 0) ?? unitRows.reduce((sum, unit) => sum + unit.meta, 0)),
    facturado: Number(query.data?.facturacion.totalMonto ?? 0),
  };
  const lost = Number(query.data?.perdidas.totalMonto ?? 0);
  const gap = Math.max(0, totals.meta - totals.facturado);
  const periodLabel = filters.meses === "all"
    ? `Año ${filters.anio}`
    : `${filters.meses.map((month) => MESES[month - 1]).join(", ")} ${filters.anio}`;

  const openUnitSummary = (unitId: string) => {
    setFilters({ unidades: [unitId] });
    setLocation("/resumen");
  };

  if (role !== "coordinador") {
    return <p className="card-elevated p-6">Este panel está disponible únicamente para coordinadores.</p>;
  }

  if (query.isError || year.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Sucursal" title="Desempeño de sucursales" />
        <div className="card-elevated flex max-w-2xl flex-col items-start gap-3 p-6" role="alert">
          <p className="text-sm text-destructive">{query.error?.message ?? year.error?.message}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { void query.refetch(); void year.refetch(); }}>Reintentar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Coordinación · Sucursales"
        title="Desempeño de sucursales"
        description={`${profile?.sucursales_ids?.length ?? (singleBranchId ? 1 : 0)} sucursales dentro de tu alcance · ${periodLabel}.`}
      />
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unidades?.map((unidad) => ({ value: unidad.id, label: unidadLabelInfo(unidad.nombre).label }))}
        defaultMes={filters.meses}
        defaultAnio={filters.anio}
        defaultUnits={filters.unidades}
        showAllMonths
      />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#294b3b] bg-[#294b3b] text-[#f5f3ed] sm:grid-cols-4" aria-label={`Resultados comerciales para ${periodLabel}`}>
        <div className="bg-[#18352b] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9c6b7]">Facturado</p>
          <strong className="mt-2 block font-display text-xl font-semibold tabular-nums sm:text-2xl">{query.isLoading ? "—" : money(totals.facturado)}</strong>
        </div>
        <div className="bg-[#18352b] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9c6b7]">Meta del período</p>
          <strong className="mt-2 block font-display text-xl font-semibold tabular-nums sm:text-2xl">{query.isLoading ? "—" : money(totals.meta)}</strong>
        </div>
        <div className="bg-[#18352b] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9c6b7]">Cumplimiento</p>
          <strong className="mt-2 block font-display text-xl font-semibold tabular-nums sm:text-2xl">{query.isLoading ? "—" : pct(totals.meta > 0 ? (totals.facturado / totals.meta) * 100 : 0, 1)}</strong>
        </div>
        <div className="bg-[#18352b] p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9c6b7]">Falta para meta</p>
          <strong className="mt-2 block font-display text-xl font-semibold tabular-nums sm:text-2xl">{query.isLoading ? "—" : money(gap)}</strong>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
        <section className="card-elevated min-w-0 p-4 sm:p-5" data-testid="chart-sucursal-trend" aria-labelledby="branch-trend-title">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="branch-trend-title" className="font-display font-semibold">Ritmo mensual · {filters.anio}</h2>
            <span className="text-xs text-muted-foreground">Facturado frente a meta</span>
          </div>
      {query.isLoading || year.isLoading ? (
            <p className="py-20 text-center text-sm text-muted-foreground">Cargando evolución…</p>
          ) : totals.meta <= 0 && totals.facturado <= 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">Sin datos para este período y estas unidades.</p>
          ) : (
            <>
              <div className="sr-only">
                <table><caption>Facturado y meta por mes</caption><thead><tr><th>Mes</th><th>Meta</th><th>Facturado</th></tr></thead><tbody>{chart.map((row) => <tr key={row.month}><th>{row.month}</th><td>{money(row.budget)}</td><td>{money(row.sales)}</td></tr>)}</tbody></table>
              </div>
              <div className="h-64" role="img" aria-label={`Evolución de facturación comparada con meta de enero a diciembre de ${filters.anio}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => Math.abs(value) >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1_000 ? `$${(value / 1_000).toFixed(0)}k` : String(value)} />
                    <Tooltip formatter={(value: number) => money(Number(value))} />
                    <Legend />
                    <Bar dataKey="budget" name="Meta" fill="#b8c5b4" radius={[3, 3, 0, 0]} />
                    <Line dataKey="sales" name="Facturado" stroke="#a65e25" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>

        <section className="card-elevated overflow-hidden" aria-labelledby="branch-unit-title">
          <header className="border-b border-border p-4 sm:p-5">
            <h2 id="branch-unit-title" className="font-display font-semibold">Brecha por unidad</h2>
            <p className="mt-1 text-xs text-muted-foreground">Prioriza el monto más alto pendiente de la meta.</p>
          </header>
          {query.isLoading || year.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Calculando distribución…</p>
          ) : unitRows.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No hay presupuesto asignado en este período.</p>
          ) : (
            <ul className="divide-y divide-border">
              {unitRows.map((unit) => {
                const missing = Math.max(0, unit.meta - unit.facturado);
                return (
                  <li key={unit.id}>
                    <button type="button" onClick={() => openUnitSummary(unit.id)} className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:px-5">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">{unit.label}</span>
                        <span className={`font-mono text-sm font-semibold tabular-nums ${unit.meta <= 0 ? "text-warning" : unit.cumplimiento < 70 ? "text-danger" : unit.cumplimiento < 90 ? "text-warning" : "text-success"}`}>
                          {unit.meta <= 0 ? "Sin meta" : pct(unit.cumplimiento, 1)}
                        </span>
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, unit.cumplimiento)}%` }} />
                      </span>
                      <span className="mt-1.5 flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{money(unit.facturado)} de {money(unit.meta)}</span>
                        <span>{unit.meta <= 0 ? "Revisar asignación" : missing > 0 ? `Faltan ${money(missing)}` : `Sobre meta ${money(Math.abs(unit.meta - unit.facturado))}`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <span className="text-xs font-semibold text-foreground">Ventas perdidas</span>
          <span className="ml-2 font-mono text-sm font-semibold tabular-nums text-danger">{query.isLoading ? "—" : money(lost)}</span>
          <span className="ml-2 text-xs text-muted-foreground">en {query.data?.perdidas.cantidad ?? 0} oportunidades registradas</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/resumen")}>Abrir detalle comercial</Button>
      </div>
    </div>
  );
}
