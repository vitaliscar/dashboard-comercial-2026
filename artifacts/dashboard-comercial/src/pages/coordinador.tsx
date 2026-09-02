import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { getCoordinadorYear } from "@/lib/paneles-http";
import { money, MESES } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";

export default function CoordinadorPage() {
  const { role, profile } = useAuth();
  const { filters } = useSharedFilters();
  const input = { anio: filters.anio, meses: filters.meses, unidades: filters.unidades, sucursales: profile?.sucursales_ids ?? [] };
  const data = useQuery({ queryKey: ["coordinador-year", JSON.stringify(input)], queryFn: () => getCoordinadorYear(input), enabled: role === "coordinador" });
  const chart = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const rows = data.data?.presupuestos.filter((row) => Number(row.mes) === i + 1) ?? [];
    return { mes: MESES[i].slice(0, 3), presupuesto: rows.reduce((s, r) => s + Number(r.monto), 0), venta: rows.reduce((s, r) => s + Number(r.ventasCcv) + Number(r.ventasXibi) + Number(r.ventasEstrategicas), 0) };
  }), [data.data]);
  const budget = chart.reduce((s, r) => s + r.presupuesto, 0); const sales = chart.reduce((s, r) => s + r.venta, 0);
  if (role !== "coordinador") return <p className="card-elevated p-6">Este panel está disponible únicamente para coordinadores.</p>;
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Coordinación" title="Panel de coordinador" description="Consolidado anual y por unidad de tu sucursal autorizada." />
    <div className="grid gap-4 md:grid-cols-3"><KpiCard label="Venta anual" value={money(sales)} hint="CCV, Xibi y estratégicas" /><KpiCard label="Presupuesto anual" value={money(budget)} hint={`${budget ? ((sales / budget) * 100).toFixed(1) : "0.0"}% cumplimiento`} /><KpiCard label="Unidades activas" value={String(new Set(data.data?.presupuestos.map((r) => r.unidadNegocioId) ?? []).size)} hint="En el alcance de sucursal" /></div>
    <section className="card-elevated h-80 p-5" data-testid="chart-coordinador-year"><h2 className="mb-4 font-display font-semibold">Presupuesto y venta por mes</h2><ResponsiveContainer width="100%" height="90%"><BarChart data={chart}><XAxis dataKey="mes" /><YAxis /><Tooltip formatter={(value: number) => money(Number(value))} /><Bar dataKey="presupuesto" fill="hsl(var(--muted-foreground))" /><Bar dataKey="venta" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></section>
    {data.isError && <p className="text-destructive" data-testid="status-coordinador-error">{data.error.message}</p>}
  </div>;
}