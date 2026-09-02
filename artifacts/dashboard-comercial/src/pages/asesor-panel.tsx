import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { getAsesorMetrics, getAsesorTrend } from "@/lib/paneles-http";
import { money, MESES, pct } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";

export default function AsesorPanelPage() {
  const { role, profile } = useAuth();
  const { filters } = useSharedFilters();
  const input = { anio: filters.anio, meses: filters.meses, unidades: filters.unidades, sucursales: profile?.sucursales_ids ?? [] };
  const key = JSON.stringify(input);
  const metrics = useQuery({ queryKey: ["asesor-panel-metrics", key], queryFn: () => getAsesorMetrics(input), enabled: role === "asesor" });
  const trend = useQuery({ queryKey: ["asesor-panel-trend", key], queryFn: () => getAsesorTrend(input), enabled: role === "asesor" });
  const billed = Number(metrics.data?.facturacion.totalMonto ?? 0);
  const budget = Array.isArray(metrics.data?.presupuestos) ? metrics.data.presupuestos.reduce((sum, row) => sum + Number(row.presupuesto ?? 0), 0) : 0;
  const chart = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i].slice(0, 3), ventas: Number(trend.data?.facturas.find((r) => Number(r.mes) === i + 1)?.monto ?? 0), presupuesto: Number(trend.data?.presupuestos.find((r) => Number(r.mes) === i + 1)?.presupuesto ?? 0) })), [trend.data]);
  if (role !== "asesor") return <p className="card-elevated p-6">Este panel está disponible únicamente para asesores.</p>;
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Vista personal" title={`Mi panel, ${profile?.nombre_completo ?? "Asesor"}`} description="Tu cuota, ventas y oportunidades reales dentro de tu alcance." />
    <div className="grid gap-4 md:grid-cols-3"><KpiCard label="Facturado" value={money(billed)} hint={`${metrics.data?.facturacion.cantidad ?? 0} operaciones`} /><KpiCard label="Cumplimiento" value={pct(budget ? billed / budget * 100 : 0)} hint={`Meta ${money(budget)}`} /><KpiCard label="Cotizaciones" value={String(metrics.data?.cotizaciones?.cantidad ?? 0)} hint={`Perdidas ${money(Number(metrics.data?.perdidas.totalMonto ?? 0))}`} /></div>
    <section className="card-elevated h-80 p-5" data-testid="chart-asesor-trend"><h2 className="mb-4 font-display font-semibold">Mi tendencia mensual</h2><ResponsiveContainer width="100%" height="90%"><ComposedChart data={chart}><XAxis dataKey="mes" /><YAxis /><Tooltip formatter={(value: number) => money(Number(value))} /><Bar dataKey="presupuesto" fill="hsl(var(--muted-foreground))" /><Line dataKey="ventas" stroke="hsl(var(--primary))" strokeWidth={3} /></ComposedChart></ResponsiveContainer></section>
    {metrics.isError && <p className="text-destructive" data-testid="status-asesor-error">{metrics.error.message}</p>}
  </div>;
}