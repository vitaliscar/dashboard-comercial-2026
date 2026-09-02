import { useQuery } from "@tanstack/react-query";
import { getEmbudo } from "@/lib/embudo-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { money } from "@/lib/format";

export default function EmbudoPage() {
  const { session } = useAuth(); const { filters } = useSharedFilters();
  const selectedMonths = Array.isArray(filters.meses) ? filters.meses.map(Number) : [];
  const query = useQuery({ queryKey: ["embudo", filters], enabled: Boolean(session), queryFn: () => getEmbudo({ anio: filters.anio, meses: selectedMonths, unidades: filters.unidades, sucursales: filters.sucursales }) });
  const totals = query.data?.totales;
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Gestión comercial" title="Embudo" description="Cotizaciones, facturación presupuestada y cobranza dentro de tu alcance." />
    {query.isLoading ? <p className="text-sm text-muted-foreground">Cargando embudo…</p> : query.isError ? <p className="text-sm text-danger">{query.error.message}</p> : <><div className="grid gap-4 sm:grid-cols-3">{[["Cotizado", totals?.cotizado ?? 0], ["Facturado", totals?.facturado ?? 0], ["Cobrado estimado", totals?.cobrado ?? 0]].map(([label, value]) => <section key={String(label)} className="rounded-xl border border-border bg-card p-5"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{money(Number(value))}</p></section>)}</div>
      <section className="rounded-xl border border-border bg-card p-5"><h3 className="font-semibold">Cotizaciones por etapa</h3><div className="mt-4 grid gap-2">{Object.entries((query.data?.cotizaciones ?? []).reduce<Record<string, number>>((all, quote) => { all[quote.etapa] = (all[quote.etapa] ?? 0) + Number(quote.monto); return all; }, {})).map(([stage, amount]) => <div key={stage} className="flex justify-between border-b border-border/60 py-2 text-sm"><span>{stage}</span><strong>{money(amount)}</strong></div>)}</div></section></>}</div>;
}