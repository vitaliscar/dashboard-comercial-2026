import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { getAlertas, resolverAlerta } from "@/lib/alertas-http";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function AlertasPage() {
  const { session, role } = useAuth();
  const client = useQueryClient();
  const [estado, setEstado] = useState<"abierta" | "resuelta" | "todas">("abierta");
  const query = useQuery({ queryKey: ["alertas", estado], queryFn: () => getAlertas(estado), enabled: Boolean(session), staleTime: 30_000 });
  const resolve = useMutation({ mutationFn: resolverAlerta, onSuccess: () => client.invalidateQueries({ queryKey: ["alertas"] }) });
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Gestión" title="Alertas" description="Riesgos detectados y reconciliados con los datos a tu alcance." />
    <div className="flex flex-wrap gap-2" aria-label="Filtrar alertas por estado">
      {([["abierta", "Abiertas"], ["resuelta", "Resueltas"], ["todas", "Todas"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={estado === value ? "default" : "outline"} aria-pressed={estado === value} onClick={() => setEstado(value)}>{label}</Button>)}
    </div>
    {query.isLoading ? <p className="text-sm text-muted-foreground">Reconciliando alertas…</p> : query.isError ? <p role="alert" className="text-sm text-danger">{query.error.message}</p> : query.data?.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No hay alertas {estado === "todas" ? "en el historial" : estado === "abierta" ? "abiertas" : "resueltas"} en tu alcance.</p> :
      <div className="grid gap-3">{query.data?.map((alerta) => <article key={alerta.id} className={`rounded-lg border border-border bg-card p-4 sm:p-5 ${alerta.severidad === "alta" && alerta.estado === "abierta" ? "border-l-4 border-l-destructive" : alerta.estado === "resuelta" ? "opacity-75" : "border-l-4 border-l-amber-500"}`}>
        <div className="flex gap-3"><AlertTriangle aria-hidden="true" className={alerta.severidad === "alta" ? "text-danger" : "text-warning"} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{alerta.titulo}</h3><span className="text-xs uppercase text-muted-foreground">{alerta.severidad}</span></div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{alerta.contexto?.detalle ?? "Sin detalle disponible."}</p>{alerta.contexto?.accion && <p className="mt-3 border-t border-border pt-3 text-sm font-medium text-primary">Siguiente acción · {alerta.contexto.accion}</p>}<p className="mt-3 text-xs text-muted-foreground">Detectada {new Date(alerta.createdAt).toLocaleString("es-VE")}{alerta.estado === "resuelta" ? ` · ${alerta.resueltaManualmente ? "Resuelta manualmente" : "Cerrada por conciliación"}${alerta.resueltaPor ? ` por ${alerta.resueltaPor}` : ""}${alerta.resueltaEn ? ` · ${new Date(alerta.resueltaEn).toLocaleString("es-VE")}` : ""}` : ""}</p></div>
          {alerta.estado === "abierta" && role !== "asesor" && <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(alerta.id)}><CheckCircle2 className="mr-1 size-4" />Resolver</Button>}
        </div></article>)}</div>}
    {resolve.isError && <p className="text-sm text-danger">{resolve.error.message}</p>}
  </div>;
}
