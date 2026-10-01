import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getAlertas, resolverAlerta } from "@/lib/alertas-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  cobranzas: "Cobranzas",
  ventas_perdidas: "Ventas perdidas",
  minutas: "Compromisos",
  cumplimiento: "Cumplimiento",
  dependencia: "Dependencia",
  cotizacion_factura: "Cotizaciones",
  cotizaciones_viejas: "Cotizaciones antiguas",
};
const SEVERITY_RANK = { alta: 0, media: 1, baja: 2 } as const;

function moduleHref(type: string) {
  if (type === "cobranzas") return "/cobranzas";
  if (type === "minutas") return "/minutas";
  if (type === "cotizacion_factura" || type === "cotizaciones_viejas") return "/embudo";
  if (type === "dependencia") return "/dashboard";
  return "/resumen";
}

export default function AlertasPage() {
  const { session, role } = useAuth();
  const client = useQueryClient();
  const { setFilters } = useSharedFilters();
  const [, setLocation] = useLocation();
  const [estado, setEstado] = useState<"abierta" | "resuelta" | "todas">("abierta");
  const [severidad, setSeveridad] = useState<"todas" | "alta" | "media" | "baja">("todas");
  const [tipo, setTipo] = useState("todas");
  const query = useQuery({ queryKey: ["alertas", estado], queryFn: () => getAlertas(estado), enabled: Boolean(session), staleTime: 30_000 });
  const resolve = useMutation({ mutationFn: resolverAlerta, onSuccess: () => client.invalidateQueries({ queryKey: ["alertas"] }) });
  const tiposDisponibles = useMemo(() => [...new Set((query.data ?? []).map((alerta) => alerta.tipo))].sort(), [query.data]);
  const visibles = useMemo(() => (query.data ?? [])
    .filter((alerta) => severidad === "todas" || alerta.severidad === severidad)
    .filter((alerta) => tipo === "todas" || alerta.tipo === tipo)
    .sort((a, b) => SEVERITY_RANK[a.severidad] - SEVERITY_RANK[b.severidad] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [query.data, severidad, tipo]);

  const openContext = (alerta: NonNullable<typeof query.data>[number]) => {
    setFilters({
      sucursales: alerta.sucursalId ? [alerta.sucursalId] : [],
      unidades: alerta.unidadNegocioId ? [alerta.unidadNegocioId] : [],
    });
    const clientParam = alerta.contexto?.cliente && alerta.tipo === "cobranzas"
      ? `?cliente=${encodeURIComponent(alerta.contexto.cliente)}`
      : "";
    setLocation(`${moduleHref(alerta.tipo)}${clientParam}`);
  };

  const highCount = (query.data ?? []).filter((alerta) => alerta.estado === "abierta" && alerta.severidad === "alta").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Gestión · Seguimiento" title="Alertas" description="Prioriza riesgos por impacto y antigüedad. Cada alerta refleja datos dentro de tu alcance." />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioridad inmediata</p><p className="mt-1 font-display text-2xl font-semibold">{highCount}<span className="ml-2 text-sm font-normal text-muted-foreground">abiertas de severidad alta</span></p></div>
        <div className="flex flex-wrap gap-2" aria-label="Filtrar alertas por estado">
          {([["abierta", "Abiertas"], ["resuelta", "Resueltas"], ["todas", "Todas"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={estado === value ? "default" : "outline"} aria-pressed={estado === value} onClick={() => setEstado(value)}>{label}</Button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="min-w-40 flex-1 text-sm"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Tipo de alerta</span><select value={tipo} onChange={(event) => setTipo(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="todas">Todos los tipos</option>{tiposDisponibles.map((item) => <option key={item} value={item}>{TYPE_LABELS[item] ?? item}</option>)}</select></label>
        <label className="min-w-40 flex-1 text-sm"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Severidad</span><select value={severidad} onChange={(event) => setSeveridad(event.target.value as typeof severidad)} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="todas">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
        <span className="pb-2 text-xs text-muted-foreground" aria-live="polite">{visibles.length} {visibles.length === 1 ? "alerta" : "alertas"}</span>
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Reconciliando alertas…</p> : query.isError ? <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudieron reconciliar las alertas." /> : visibles.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No hay alertas que coincidan con estos filtros.</p> :
        <div className="grid gap-3">{visibles.map((alerta) => {
          const ageDays = Math.max(0, Math.floor((Date.now() - new Date(alerta.createdAt).getTime()) / 86_400_000));
          const ageLabel = ageDays === 0 ? "hoy" : ageDays === 1 ? "hace 1 día" : `hace ${ageDays} días`;
          return <article key={alerta.id} className={`rounded-lg border border-border bg-card p-4 sm:p-5 ${alerta.severidad === "alta" && alerta.estado === "abierta" ? "border-l-4 border-l-destructive" : alerta.estado === "resuelta" ? "opacity-75" : "border-l-4 border-l-amber-500"}`}>
            <div className="flex flex-wrap items-start gap-3"><AlertTriangle aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${alerta.severidad === "alta" ? "text-danger" : "text-warning"}`} /><div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{alerta.titulo}</h3><span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">{TYPE_LABELS[alerta.tipo] ?? alerta.tipo}</span><span className={`text-xs font-semibold uppercase ${alerta.severidad === "alta" ? "text-danger" : alerta.severidad === "media" ? "text-warning" : "text-muted-foreground"}`}>Severidad {alerta.severidad}</span></div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{alerta.contexto?.detalle ?? "Sin detalle disponible."}</p>
              {alerta.contexto?.monto != null && <p className="mt-2 font-mono text-sm font-semibold tabular-nums">{money(alerta.contexto.monto)}</p>}
              {alerta.contexto?.accion && <p className="mt-3 border-t border-border pt-3 text-sm font-medium text-primary">Siguiente acción · {alerta.contexto.accion}</p>}
              <p className="mt-3 text-xs text-muted-foreground">Detectada {new Date(alerta.createdAt).toLocaleString("es-VE")} · {alerta.estado === "abierta" ? ageLabel : `${alerta.resueltaManualmente ? "Resuelta manualmente" : "Cerrada por conciliación"}${alerta.resueltaPor ? ` por ${alerta.resueltaPor}` : ""}${alerta.resueltaEn ? ` · ${new Date(alerta.resueltaEn).toLocaleString("es-VE")}` : ""}`}</p>
            </div><div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => openContext(alerta)}>{alerta.contexto?.cliente ? "Abrir cliente" : "Abrir módulo"}</Button>
              {alerta.estado === "abierta" && role !== "asesor" && <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(alerta.id)}><CheckCircle2 aria-hidden="true" className="mr-1 size-4" />Resolver</Button>}
            </div></div>
          </article>;
        })}</div>}
      {resolve.isError && <p role="alert" className="text-sm text-danger">{resolve.error.message}</p>}
    </div>
  );
}
