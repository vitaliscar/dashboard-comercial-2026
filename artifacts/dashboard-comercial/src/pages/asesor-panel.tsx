import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { getAllowedMonths } from "@/lib/date-range";
import { getAsesorMetrics, getAsesorTrend } from "@/lib/paneles-http";
import { money, MESES, pct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { unidadLabelInfo } from "@/lib/unidad-labels";

const DONE_STATES = /^(completad[oa]s?|cerrad[oa]s?|resuelt[oa]s?|cancelad[oa]s?|anulad[oa]s?)$/i;

export default function AsesorPanelPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { data: unidades } = useUnidades();
  const assignedUnitIds = profile?.unidades_negocio_ids?.length
    ? profile.unidades_negocio_ids
    : profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : [];
  const allowedUnitIds = useMemo(() => new Set(assignedUnitIds), [assignedUnitIds]);
  const selectedUnitIds = filters.unidades.filter((id) => allowedUnitIds.has(id));
  const assignedBranchIds = profile?.sucursales_ids?.length
    ? profile.sucursales_ids
    : profile?.sucursal_id ? [profile.sucursal_id] : [];
  const input = {
    anio: filters.anio,
    meses: filters.meses,
    unidades: selectedUnitIds,
    sucursales: assignedBranchIds,
  };
  const key = JSON.stringify(input);
  const metrics = useQuery({ queryKey: ["asesor-panel-metrics", key], queryFn: () => getAsesorMetrics(input), enabled: role === "asesor" });
  const trend = useQuery({ queryKey: ["asesor-panel-trend", key], queryFn: () => getAsesorTrend(input), enabled: role === "asesor" });

  const handleApplyFilters = useCallback((next: FilterState) => {
    setFilters({
      anio: next.anio,
      meses: next.meses,
      unidades: (next.unidades ?? (next.unidad ? [next.unidad] : [])).filter((id) => allowedUnitIds.has(id)),
    });
  }, [allowedUnitIds, setFilters]);

  const billed = Number(metrics.data?.facturacion.totalMonto ?? 0);
  const budgets = Array.isArray(metrics.data?.presupuestos) ? metrics.data.presupuestos : [];
  const budget = budgets.reduce((sum, row) => sum + Number(row.presupuesto ?? 0), 0);
  const attainment = budget > 0 ? (billed / budget) * 100 : 0;
  const gap = Math.max(0, budget - billed);
  const months = useMemo(() => getAllowedMonths(filters.anio, filters.meses), [filters.anio, filters.meses]);
  const chart = useMemo(() => months.map((month) => ({
    month: MESES[month - 1].slice(0, 3),
    monthNumber: month,
    billed: Number(trend.data?.facturas.find((row) => Number(row.mes) === month)?.monto ?? 0),
    target: Number(trend.data?.presupuestos.find((row) => Number(row.mes) === month)?.presupuesto ?? 0),
  })), [months, trend.data]);

  const activeCommitments = useMemo(
    () => (metrics.data?.minutas ?? []).filter((item) => !DONE_STATES.test(item.estado.trim())),
    [metrics.data?.minutas],
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const overdueCommitments = activeCommitments.filter(
    (item) => item.fechaLimite && item.fechaLimite.slice(0, 10) < todayKey,
  ).reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0);
  const activeCommitmentCount = activeCommitments.reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0);
  const assignedUnitLabel = assignedUnitIds
    .map((id) => unidades?.find((unit) => unit.id === id)?.nombre)
    .filter((name): name is string => Boolean(name))
    .map((name) => unidadLabelInfo(name).label)
    .join(" · ");
  const unitOptions = unidades
    ?.filter((unit) => allowedUnitIds.has(unit.id))
    .map((unit) => ({ value: unit.id, label: unidadLabelInfo(unit.nombre).label }));

  if (role !== "asesor") return <p className="card-elevated p-6">Este panel está disponible únicamente para asesores.</p>;

  if (metrics.isLoading) {
    return <div className="card-elevated mx-auto mt-8 max-w-2xl p-8 text-center text-sm text-muted-foreground">Cargando tus resultados comerciales…</div>;
  }

  if (metrics.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Vista personal" title={`Mi panel, ${profile?.nombre_completo ?? "Asesor"}`} />
        <div className="card-elevated flex max-w-2xl flex-col items-start gap-3 p-6" role="alert">
          <p className="text-sm text-destructive">{metrics.error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void metrics.refetch()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ccv-role-dashboard ccv-role-advisor flex flex-col gap-5">
      <PageHeader
        eyebrow="Vista personal"
        title={`Mi panel, ${profile?.nombre_completo ?? "Asesor"}`}
        description={assignedUnitLabel || "Resultados propios · la meta aparecerá cuando tu coordinador te asigne presupuesto."}
      />
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unitOptions}
        defaultMes={filters.meses}
        defaultAnio={filters.anio}
        defaultUnits={selectedUnitIds}
        showAllMonths
      />

      <section className="grid gap-px overflow-hidden rounded-xl border border-[#294b3b] bg-[#294b3b] text-[#f5f3ed] lg:grid-cols-[1.35fr_0.8fr]" aria-label="Tu avance frente a la meta">
        <div className="bg-[#18352b] p-5 sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#b9c6b7]">Facturado del período</p>
          <strong className="mt-3 block font-display text-4xl font-semibold tabular-nums sm:text-5xl">{money(billed)}</strong>
          {budget > 0 ? (
            <>
              <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-lg font-semibold tabular-nums">{pct(attainment, 1)} <span className="font-sans text-xs font-medium text-[#b9c6b7]">de tu meta</span></span>
                <span className="text-xs text-[#b9c6b7]">{gap > 0 ? `Faltan ${money(gap)}` : `Meta superada por ${money(billed - budget)}`}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#395548]" role="progressbar" aria-label="Cumplimiento de tu meta" aria-valuenow={Math.round(attainment)} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-full rounded-full bg-[#d9e7b9]" style={{ width: `${Math.min(100, attainment)}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-5 max-w-md text-sm text-[#d4ddd2]">No hay una meta asignada para este filtro. Pide a tu coordinador que reparta el presupuesto de tu unidad.</p>
          )}
        </div>
        <div className="grid grid-cols-2 bg-[#203f33]">
          <div className="border-b border-r border-[#395548] p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b9c6b7]">Meta asignada</p>
            <strong className="mt-2 block font-mono text-lg font-semibold tabular-nums">{money(budget)}</strong>
          </div>
          <div className="border-b border-[#395548] p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b9c6b7]">Cotizaciones</p>
            <strong className="mt-2 block font-mono text-lg font-semibold tabular-nums">{metrics.data?.cotizaciones?.cantidad ?? 0}</strong>
          </div>
          <div className="border-r border-[#395548] p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b9c6b7]">Ventas perdidas</p>
            <strong className="mt-2 block font-mono text-lg font-semibold tabular-nums">{money(Number(metrics.data?.perdidas.totalMonto ?? 0))}</strong>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b9c6b7]">Compromisos abiertos</p>
            <strong className="mt-2 block font-mono text-lg font-semibold tabular-nums">{activeCommitmentCount}</strong>
            {overdueCommitments > 0 && <span className="mt-1 block text-xs text-[#f0b6a8]">{overdueCommitments} vencidos</span>}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
        <section className="card-elevated min-w-0 p-4 sm:p-5" data-testid="chart-asesor-trend" aria-labelledby="advisor-trend-title">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="advisor-trend-title" className="font-display font-semibold">Mi evolución · {filters.anio}</h2>
            <span className="text-xs text-muted-foreground">Meta y facturación por mes</span>
          </div>
          {trend.isError ? (
            <p className="py-16 text-center text-sm text-destructive" role="alert">{trend.error.message}</p>
          ) : chart.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sin movimientos para el período seleccionado.</p>
          ) : (
            <>
              <div className="sr-only">
                <table><caption>Tu facturación y meta por mes</caption><thead><tr><th>Mes</th><th>Meta</th><th>Facturado</th></tr></thead><tbody>{chart.map((row) => <tr key={row.monthNumber}><th>{row.month}</th><td>{money(row.target)}</td><td>{money(row.billed)}</td></tr>)}</tbody></table>
              </div>
              <div className="h-64" role="img" aria-label={`Tu facturación comparada con meta por mes en ${filters.anio}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => Math.abs(value) >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1_000 ? `$${(value / 1_000).toFixed(0)}k` : String(value)} />
                    <Tooltip formatter={(value: number) => money(Number(value))} />
                    <Legend />
                    <Bar dataKey="target" name="Meta" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
                    <Line dataKey="billed" name="Facturado" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>

        <section className="card-elevated flex flex-col justify-between gap-5 p-5" aria-labelledby="advisor-next-steps-title">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Tu siguiente paso</p>
            <h2 id="advisor-next-steps-title" className="mt-2 font-display text-lg font-semibold">Revisa tus compromisos</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {overdueCommitments > 0
                ? `Tienes ${overdueCommitments} compromisos vencidos. Actualiza su estado o fecha de seguimiento.`
                : activeCommitmentCount > 0
                  ? `Tienes ${activeCommitmentCount} compromisos abiertos. Revísalos para planificar el seguimiento.`
                  : "No tienes compromisos abiertos registrados para este período."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/minutas" className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Ver compromisos</Link>
            <Link href="/resumen" className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted">Ver detalle comercial</Link>
          </div>
        </section>
      </section>
    </div>
  );
}
