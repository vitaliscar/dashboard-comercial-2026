import { isFullAccessRole } from "@/lib/permissions";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-catalogos";
import { getEvaluacionUnidad } from "@/lib/evaluacion-http";
import { money, pct } from "@/lib/format";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export default function EvaluacionUnidadPage() {
  const { role } = useAuth(); const { data: units } = useUnidades(); const anio = new Date().getFullYear(); const [unitId, setUnitId] = useState("");
  const canView = role === "coordinador" || role === "gerente_comercial" || isFullAccessRole(role);
  const query = useQuery({ queryKey: ["evaluacion-unidad", anio, unitId], queryFn: () => getEvaluacionUnidad(anio, unitId), enabled: canView && !!unitId });
  if (!canView) return <p className="p-8 text-center text-muted-foreground">Esta evaluación no está disponible para el rol asesor.</p>;
  const data = query.data; const pointsByMonth = new Map((data?.puntos ?? []).map((point) => [point.mes, point])); const chart = MONTHS.map((mes, index) => { const point = pointsByMonth.get(index + 1); return { mes, cumplimiento: point?.presupuesto ? Math.round((point.venta / point.presupuesto) * 1000) / 10 : null }; });
  return <div className="ccv-evaluation-detail ccv-evaluation-unit flex flex-col gap-6"><PageHeader eyebrow="Evaluación de Desempeño" title={data?.unidad ?? "Unidad de negocio"} description={`Año ${anio}`} /><label className="ccv-evaluation-control">Unidad de negocio<select value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Seleccionar unidad…</option>{units?.map((unit) => <option key={unit.id} value={unit.id}>{unit.nombre}</option>)}</select></label>
    {!unitId ? <p className="ccv-evaluation-message" role="status">Selecciona una unidad de negocio para ver su evaluación.</p> : query.isLoading ? <p className="ccv-evaluation-message" role="status">Cargando evaluación…</p> : query.isError || !data ? <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo cargar la evaluación." /> : <><div className="ccv-evaluation-kpis grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"><KpiCard label="Score de desempeño" value={String(data.score.score)} accent={data.score.banda} hint="Cumplimiento 50 %, tendencia 30 % y ticket 20 %. El ticket es neutral (50/100): este cálculo no compara unidades entre sí." /><KpiCard label="Cumplimiento" value={pct(data.score.cumplimiento, 1)} /><KpiCard label="Tendencia" value={pct(data.score.tendencia, 0)} /><KpiCard label="Ticket promedio de la unidad" value={money(data.ticketPropio)} /></div><section className="ccv-evaluation-chart" aria-label="Evolución mensual de cumplimiento"><h3>Evolución mensual de cumplimiento</h3><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} accessibilityLayer><XAxis dataKey="mes" minTickGap={16} tickMargin={8} /><YAxis unit="%" width={42} /><Tooltip formatter={(value) => value == null ? "Sin meta" : `${value}%`} /><Line type="monotone" dataKey="cumplimiento" name="Cumplimiento" stroke="var(--color-chart-1)" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></section><section className="rounded-lg border bg-card p-5"><h3 className="mb-4 font-semibold">Desglose por sucursal</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Sucursal</th><th className="p-2 text-right">Presupuesto</th><th className="p-2 text-right">Venta</th><th className="p-2 text-right">Cumplimiento</th></tr></thead><tbody>{data.desglosePorSucursal.map((branch) => <tr key={branch.sucursal} className="border-b"><td className="p-2">{branch.sucursal}</td><td className="p-2 text-right">{money(branch.presupuesto)}</td><td className="p-2 text-right">{money(branch.venta)}</td><td className="p-2 text-right">{pct(branch.cumplimiento, 1)}</td></tr>)}</tbody></table></div></section></>}</div>;
}
