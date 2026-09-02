import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/hooks/use-auth";
import { getEvaluacionAsesor } from "@/lib/evaluacion-http";
import { money, pct } from "@/lib/format";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function EvaluacionAsesorPage() {
  const { role } = useAuth();
  const anio = new Date().getFullYear();
  const query = useQuery({ queryKey: ["evaluacion-asesor", anio], queryFn: () => getEvaluacionAsesor(anio), enabled: role === "asesor" });
  if (role !== "asesor") return <p className="p-8 text-center text-muted-foreground">Esta evaluación es solo para el rol asesor.</p>;
  if (query.isLoading) return <p className="p-8 text-muted-foreground">Cargando evaluación…</p>;
  if (query.isError || !query.data) return <p className="p-8 text-destructive">{query.error?.message ?? "No se pudo cargar la evaluación."}</p>;
  const data = query.data;
  const chart = data.puntos.map((point) => ({ mes: MONTHS[point.mes - 1] ?? `M${point.mes}`, cumplimiento: point.presupuesto ? Math.round((point.venta / point.presupuesto) * 1000) / 10 : null }));
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Evaluación de Desempeño" title={data.asesor} description={`Año ${anio}`} />
    <div className="grid gap-4 md:grid-cols-4">
      <KpiCard label="Score de desempeño" value={String(data.score.score)} accent={data.score.banda} hint="Cumplimiento 50%, tendencia 30% y ticket vs. grupo 20%." />
      <KpiCard label="Cumplimiento" value={pct(data.score.cumplimiento, 1)} />
      <KpiCard label="Tendencia" value={pct(data.score.tendencia, 0)} />
      <KpiCard label="Vs. pares de sucursal" value={`Percentil ${data.percentilVsPares}`} hint={`${data.cantidadPares} asesores comparados.`} />
    </div>
    <section className="rounded-lg border bg-card p-5"><h3 className="mb-4 font-semibold">Evolución mensual de cumplimiento</h3><ResponsiveContainer width="100%" height={280}><LineChart data={chart}><XAxis dataKey="mes" /><YAxis /><Tooltip formatter={(value) => value == null ? "Sin datos" : `${value}%`} /><Line type="monotone" dataKey="cumplimiento" stroke="hsl(var(--primary))" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></section>
    <div className="grid gap-4 md:grid-cols-2"><KpiCard label="Ticket promedio propio" value={money(data.ticketPropio)} /><KpiCard label="Ticket promedio del grupo" value={money(data.ticketPromedioGrupo)} /></div>
  </div>;
}