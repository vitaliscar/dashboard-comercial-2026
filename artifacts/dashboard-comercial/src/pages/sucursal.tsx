import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { getSucursalMetrics, getSucursalTrend } from "@/lib/paneles-http";
import { money, MESES, pct } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";

export default function SucursalPage() {
  const { role, profile } = useAuth();
  const { filters } = useSharedFilters();
  const input = { anio: filters.anio, meses: filters.meses, unidades: filters.unidades, sucursales: role === "coordinador" || role === "asesor" ? profile?.sucursales_ids ?? [] : filters.sucursales };
  const key = JSON.stringify(input);
  const metrics = useQuery({ queryKey: ["sucursal-metrics", key], queryFn: () => getSucursalMetrics(input), enabled: !!role });
  const trend = useQuery({ queryKey: ["sucursal-trend", key], queryFn: () => getSucursalTrend(input), enabled: !!role });
  const budget = metrics.data && !Array.isArray(metrics.data.presupuestos) ? Number(metrics.data.presupuestos.totalMonto) : 0;
  const billed = Number(metrics.data?.facturacion.totalMonto ?? 0);
  const chart = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    mes: MESES[i].slice(0, 3),
    ventas: Number(trend.data?.facturas.find((row) => Number(row.mes) === i + 1)?.monto ?? 0),
    presupuesto: Number(trend.data?.presupuestos.find((row) => Number(row.mes) === i + 1)?.monto ?? 0),
  })), [trend.data]);
  if (role === "asesor") return <p className="card-elevated p-6">Tu panel personal está disponible en “Mi Panel”.</p>;
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Sucursal" title="Desempeño de sucursal" description="Facturación, presupuesto y oportunidades del alcance autorizado." />
    <div className="grid gap-4 md:grid-cols-3">
      <KpiCard label="Facturación" value={money(billed)} hint={`${metrics.data?.facturacion.cantidad ?? 0} operaciones`} />
      <KpiCard label="Presupuesto" value={money(budget)} hint={`${pct(budget ? billed / budget * 100 : 0)} cumplimiento`} />
      <KpiCard label="Ventas perdidas" value={money(Number(metrics.data?.perdidas.totalMonto ?? 0))} hint={`${metrics.data?.perdidas.cantidad ?? 0} oportunidades`} />
    </div>
    <section className="card-elevated h-80 p-5" data-testid="chart-sucursal-trend">
      <h2 className="mb-4 font-display font-semibold">Ventas vs. presupuesto</h2>
      <ResponsiveContainer width="100%" height="90%"><ComposedChart data={chart}><XAxis dataKey="mes" /><YAxis /><Tooltip formatter={(value: number) => money(Number(value))} /><Legend /><Bar dataKey="presupuesto" fill="hsl(var(--muted-foreground))" /><Line dataKey="ventas" stroke="hsl(var(--primary))" strokeWidth={3} /></ComposedChart></ResponsiveContainer>
    </section>
    {metrics.isError && <p className="text-destructive" data-testid="status-sucursal-error">{metrics.error.message}</p>}
  </div>;
}