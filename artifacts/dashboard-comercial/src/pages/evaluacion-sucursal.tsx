import { isFullAccessRole } from "@/lib/permissions";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales } from "@/hooks/use-catalogos";
import { getEvaluacionSucursal } from "@/lib/evaluacion-http";
import { money, pct } from "@/lib/format";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export default function EvaluacionSucursalPage() {
  const { role, profile } = useAuth(); const { data: branches } = useSucursales(); const anio = new Date().getFullYear();
  const [selected, setSelected] = useState(""); const canView = role === "coordinador" || role === "gerente_comercial" || isFullAccessRole(role);
  const assignedBranchIds = profile?.sucursales_ids?.length
    ? profile.sucursales_ids
    : profile?.sucursal_id ? [profile.sucursal_id] : [];
  const availableBranches = role === "coordinador"
    ? branches?.filter((branch) => assignedBranchIds.includes(branch.id))
    : branches;
  const branchId = role === "coordinador"
    ? (selected && assignedBranchIds.includes(selected) ? selected : assignedBranchIds[0])
    : selected || undefined;
  const query = useQuery({ queryKey: ["evaluacion-sucursal", anio, branchId], queryFn: () => getEvaluacionSucursal(anio, branchId), enabled: canView && !!branchId });
  if (!canView) return <p className="p-8 text-center text-muted-foreground">Esta evaluación no está disponible para el rol asesor.</p>;
  return <div className="ccv-evaluation-detail ccv-evaluation-branch flex flex-col gap-6"><PageHeader eyebrow="Evaluación de Desempeño" title={query.data?.sucursal ?? "Sucursal"} description={`Año ${anio}`} />
    {(role !== "coordinador" || assignedBranchIds.length > 1) && <label className="max-w-sm text-sm font-medium">Sucursal<select className="mt-1 block w-full rounded-md border bg-card p-2" value={branchId ?? ""} onChange={(event) => setSelected(event.target.value)}><option value="">Seleccionar sucursal…</option>{availableBranches?.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></label>}
    {!branchId ? <p className="p-8 text-center text-muted-foreground">Selecciona una sucursal para ver su evaluación.</p> : query.isLoading ? <p className="p-8 text-muted-foreground">Cargando evaluación…</p> : query.isError || !query.data ? <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo cargar la evaluación." /> : <SucursalData data={query.data} />}
  </div>;
}
function SucursalData({ data }: { data: Awaited<ReturnType<typeof getEvaluacionSucursal>> }) {
  const pointsByMonth = new Map(data.puntos.map((point) => [point.mes, point]));
  const chart = MONTHS.map((mes, index) => {
    const point = pointsByMonth.get(index + 1);
    return { mes, cumplimiento: point?.presupuesto ? Math.round((point.venta / point.presupuesto) * 1000) / 10 : null };
  });
  return <><div className="grid gap-4 md:grid-cols-4"><KpiCard label="Score de desempeño" value={String(data.score.score)} accent={data.score.banda} hint="Cumplimiento 50 %, tendencia 30 % y ticket 20 % frente al grupo; sin pares, el ticket aporta un valor neutral de 50/100." /><KpiCard label="Cumplimiento" value={pct(data.score.cumplimiento, 1)} /><KpiCard label="Tendencia" value={pct(data.score.tendencia, 0)} /><KpiCard label="Vs. sucursales" value={data.percentilVsPares == null ? "Sin comparación" : `Percentil ${data.percentilVsPares}`} hint={`${data.cantidadPares} sucursales comparadas.`} /></div><section className="rounded-lg border bg-card p-5"><h3 className="mb-4 font-semibold">Evolución mensual de cumplimiento</h3><ResponsiveContainer width="100%" height={280}><LineChart data={chart}><XAxis dataKey="mes" /><YAxis /><Tooltip formatter={(value) => value == null ? "Sin meta" : `${value}%`} /><Line type="monotone" dataKey="cumplimiento" stroke="hsl(var(--primary))" strokeWidth={2} /></LineChart></ResponsiveContainer></section><div className="grid gap-4 md:grid-cols-2"><KpiCard label="Ticket promedio propio" value={money(data.ticketPropio)} /><KpiCard label="Ticket promedio del grupo" value={data.ticketPromedioGrupo == null ? "—" : money(data.ticketPromedioGrupo)} /></div></>;
}
