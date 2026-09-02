import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getAlertas, resolverAlerta } from "@/lib/alertas-http";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function AlertasPage() {
  const { session, role } = useAuth();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["alertas"], queryFn: getAlertas, enabled: Boolean(session), staleTime: 30_000 });
  const resolve = useMutation({ mutationFn: resolverAlerta, onSuccess: () => client.invalidateQueries({ queryKey: ["alertas"] }) });
  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Gestión" title="Alertas" description="Riesgos detectados y reconciliados con los datos a tu alcance." />
    {query.isLoading ? <p className="text-sm text-muted-foreground">Reconciliando alertas…</p> : query.isError ? <p className="text-sm text-danger">{query.error.message}</p> : query.data?.length === 0 ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No hay alertas abiertas en tu alcance.</p> :
      <div className="grid gap-3">{query.data?.map((alerta) => <article key={alerta.id} className="rounded-xl border border-border bg-card p-4">
        <div className="flex gap-3"><AlertTriangle className={alerta.severidad === "alta" ? "text-danger" : "text-warning"} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{alerta.titulo}</h3><span className="text-xs uppercase text-muted-foreground">{alerta.severidad}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">{alerta.contexto?.detalle ?? "Sin detalle disponible."}</p>{alerta.contexto?.accion && <p className="mt-2 text-xs font-medium text-primary">{alerta.contexto.accion}</p>}</div>
          {role !== "asesor" && <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(alerta.id)}><CheckCircle2 className="mr-1 size-4" />Resolver</Button>}
        </div></article>)}</div>}
    {resolve.isError && <p className="text-sm text-danger">{resolve.error.message}</p>}
  </div>;
}