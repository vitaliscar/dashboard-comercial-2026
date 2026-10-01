import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCliente360, type Cliente360Fuente } from "@/lib/cliente-360-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { money } from "@/lib/format";

const PAGE_SIZE = 25;
const clientKey = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

export default function Cliente360Page() {
  const { session } = useAuth();
  const { filters } = useSharedFilters();
  const [fuente, setFuente] = useState<Cliente360Fuente>("facturado");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const selectedMonths = Array.isArray(filters.meses) ? filters.meses : [];
  const data = useQuery({
    queryKey: ["cliente-360", fuente, filters],
    enabled: Boolean(session),
    queryFn: () => getCliente360({ fuente, anio: filters.anio, meses: selectedMonths.map(Number), unidades: filters.unidades, sucursales: filters.sucursales }),
  });
  const clients = useMemo(() => {
    const byClient = new Map<string, { cliente: string; monto: number }>();
    for (const item of data.data?.pareto ?? []) {
      const key = clientKey(item.cliente);
      const current = byClient.get(key);
      if (current) current.monto += Number(item.monto) || 0;
      else byClient.set(key, { cliente: item.cliente.trim(), monto: Number(item.monto) || 0 });
    }
    return [...byClient.values()].sort((a, b) => b.monto - a.monto);
  }, [data.data?.pareto]);
  const invoicesByClient = useMemo(() => new Map((data.data?.facturas ?? []).map((row) => [clientKey(row.cliente), row])), [data.data?.facturas]);
  const receivablesByClient = useMemo(() => new Map((data.data?.cobranzas ?? []).map((row) => [clientKey(row.cliente), row])), [data.data?.cobranzas]);
  const filteredClients = useMemo(() => clients.filter((row) => row.cliente.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))), [clients, search]);
  const pageCount = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleClients = filteredClients.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE);

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Gestión comercial" title="Cliente 360" description="Valor comercial, facturación reciente y saldo por cobrar dentro de tu alcance." />
    <div className="flex flex-wrap items-center gap-2" aria-label="Fuente del ranking">
      {(["facturado", "cotizado", "perdido"] as Cliente360Fuente[]).map((value) => <button key={value} type="button" aria-pressed={fuente === value} onClick={() => { setFuente(value); setPage(0); }} className={`rounded-lg px-3 py-2 text-sm capitalize ${fuente === value ? "bg-primary text-primary-foreground" : "border border-border"}`}>{value}</button>)}
      <label htmlFor="cliente-search" className="sr-only">Buscar cliente</label>
      <input id="cliente-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar cliente" className="ml-auto h-10 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-sm" />
    </div>
    {data.isLoading ? <p className="text-sm text-muted-foreground">Cargando clientes…</p> : data.isError ? <QueryErrorNotice error={data.error} onRetry={() => void data.refetch()} fallback="No se pudieron cargar los clientes." /> : <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Clientes ordenados por monto {fuente}</caption>
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 text-left text-muted-foreground backdrop-blur"><tr><th scope="col" className="p-3">Cliente</th><th scope="col" className="p-3 text-right">Monto {fuente}</th><th scope="col" className="p-3 text-right">Cartera</th><th scope="col" className="p-3">Última factura</th></tr></thead>
          <tbody>{visibleClients.map((item) => {
            const key = clientKey(item.cliente);
            const receivable = receivablesByClient.get(key);
            const invoice = invoicesByClient.get(key);
            return <tr key={key} className="border-b border-border/60"><th scope="row" className="p-3 text-left font-medium">{item.cliente}</th><td className="p-3 text-right tabular-nums">{money(item.monto)}</td><td className="p-3 text-right tabular-nums">{money(Number(receivable?.saldo ?? 0))}</td><td className="p-3">{invoice?.fecha ? new Date(`${invoice.fecha}T00:00:00`).toLocaleDateString("es-VE") : "—"}</td></tr>;
          })}
          {visibleClients.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>{search ? "No hay coincidencias para esa búsqueda." : "No hay clientes para estos filtros."}</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filteredClients.length === 0 ? "0 clientes" : `${visiblePage * PAGE_SIZE + 1}–${Math.min((visiblePage + 1) * PAGE_SIZE, filteredClients.length)} de ${filteredClients.length} clientes`}</span>
        <div className="flex gap-2"><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Anterior</button><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage >= pageCount - 1} onClick={() => setPage(visiblePage + 1)}>Siguiente</button></div>
      </div>
    </>}
  </div>;
}
