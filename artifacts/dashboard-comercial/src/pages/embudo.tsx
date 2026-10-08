import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getEmbudo } from "@/lib/embudo-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { money } from "@/lib/format";

export default function EmbudoPage() {
  const { session } = useAuth();
  const { filters } = useSharedFilters();
  const selectedMonths = Array.isArray(filters.meses) ? filters.meses.map(Number) : [];
  const query = useQuery({
    queryKey: ["embudo", filters],
    enabled: Boolean(session),
    queryFn: () => getEmbudo({ anio: filters.anio, meses: selectedMonths, unidades: filters.unidades, sucursales: filters.sucursales }),
  });
  const stages = useMemo(() => {
    const grouped = new Map<string, { count: number; amount: number }>();
    for (const quote of query.data?.cotizaciones ?? []) {
      const quoteMonth = Number(quote.fecha.slice(5, 7));
      if (selectedMonths.length > 0 && !selectedMonths.includes(quoteMonth)) continue;
      const stage = grouped.get(quote.etapa) ?? { count: 0, amount: 0 };
      stage.count += 1;
      stage.amount += Number(quote.monto) || 0;
      grouped.set(quote.etapa, stage);
    }
    return [...grouped.entries()].map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.amount - a.amount);
  }, [query.data?.cotizaciones, selectedMonths]);
  const totals = query.data?.totales;
  const relation = (value: number, base: number) => base > 0 ? `${(value / base * 100).toFixed(1)} %` : "–";
  const saldoPendiente = (totals?.facturado ?? 0) - (totals?.cobrado ?? 0);

  return <div className="ccv-funnel-page flex flex-col gap-6">
    <PageHeader eyebrow="Gestión comercial" title="Embudo" description="Volumen cotizado por etapa y relación agregada entre cotización, facturación y cartera." />
    {query.isLoading ? <p className="text-sm text-muted-foreground">Cargando embudo…</p> : query.isError ? <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo cargar el embudo." /> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Cotizado", value: totals?.cotizado ?? 0, caption: `${query.data?.cotizaciones.length ?? 0} cotizaciones` },
          { label: "Facturado", value: totals?.facturado ?? 0, caption: `${relation(totals?.facturado ?? 0, totals?.cotizado ?? 0)} del monto cotizado · relación de montos` },
          { label: "Saldo pendiente actual", value: saldoPendiente, caption: "Cartera abierta; no se limita al período seleccionado" },
        ].map(({ label, value, caption }, index) => <section key={label} className={`ccv-funnel-kpi rounded-lg border border-border bg-card p-5 ${index === 0 ? "is-primary border-t-[3px] border-t-primary" : ""}`}>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-2xl font-medium tabular-nums tracking-tight">{money(Number(value))}</p>
          <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
        </section>)}
      </div>
      <p className="ccv-funnel-explainer rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Los totales vienen de registros agregados distintos; la base no atribuye cada factura o cobro a una cotización específica. Los porcentajes muestran relación entre montos y no una tasa de conversión.
      </p>
      <div className="ccv-funnel-analysis">
      <section className="card-elevated p-5 sm:p-6" aria-labelledby="embudo-etapas-title" data-testid="embudo-stage-chart">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Valor abierto por etapa</p>
            <h2 id="embudo-etapas-title" className="font-display text-xl font-semibold">Dónde está concentrado el embudo</h2>
          </div>
          <span className="text-xs text-muted-foreground">{stages.length} etapas con actividad</span>
        </div>
        {stages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No hay cotizaciones para representar.</p>
        ) : (
          <div className="h-[260px] w-full" role="img" aria-label={`Gráfico de monto cotizado por etapa: ${stages.map((stage) => `${stage.name}, ${money(stage.amount)}`).join("; ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 22, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 5" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={(value) => new Intl.NumberFormat("es-VE", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))} />
                <YAxis type="category" dataKey="name" width={132} axisLine={false} tickLine={false} tick={{ fill: "var(--color-foreground)", fontSize: 12 }} />
                <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: "rgba(29, 80, 59, 0.06)" }} />
                <Bar dataKey="amount" name="Monto cotizado" fill="var(--color-primary)" radius={[0, 3, 3, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4"><h3 className="font-semibold">Cotizaciones por etapa</h3><p className="text-sm text-muted-foreground">Cantidad y valor para comparar dónde se concentra el embudo.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2 pr-4">Etapa</th><th className="px-4 py-2 text-right">Cotizaciones</th><th className="px-4 py-2 text-right">Monto</th><th className="py-2 pl-4 text-right">Participación del monto cotizado</th></tr></thead>
            <tbody>{stages.map((stage) => <tr key={stage.name} className="border-b border-border/60"><th scope="row" className="py-3 pr-4 text-left font-medium">{stage.name}</th><td className="px-4 py-3 text-right tabular-nums">{stage.count}</td><td className="px-4 py-3 text-right tabular-nums">{money(stage.amount)}</td><td className="py-3 pl-4 text-right tabular-nums">{relation(stage.amount, Number(totals?.cotizado ?? 0))}</td></tr>)}
              {stages.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No hay cotizaciones para los filtros seleccionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </>}
  </div>;
}
