import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { getCliente360, type Cliente360Fuente } from "@/lib/cliente-360-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { money } from "@/lib/format";

const PAGE_SIZE = 25;
type ClientSummary = { cliente: string; monto: number };
const SOURCE_LABEL: Record<Cliente360Fuente, string> = {
  facturado: "Facturado",
  cotizado: "Cotizado",
  perdido: "Ventas perdidas",
};
const clientKey = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

function formatInvoiceDate(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return "–";

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  let date: Date;

  if (isoDate) {
    date = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  } else if (localDate) {
    date = new Date(Number(localDate[3]), Number(localDate[2]) - 1, Number(localDate[1]));
  } else {
    date = new Date(raw);
  }

  if (!Number.isFinite(date.getTime())) return "–";
  if (isoDate && (date.getFullYear() !== Number(isoDate[1]) || date.getMonth() !== Number(isoDate[2]) - 1 || date.getDate() !== Number(isoDate[3]))) return "–";
  if (localDate && (date.getFullYear() !== Number(localDate[3]) || date.getMonth() !== Number(localDate[2]) - 1 || date.getDate() !== Number(localDate[1]))) return "–";
  return date.toLocaleDateString("es-VE");
}

export default function Cliente360Page() {
  const { session } = useAuth();
  const { filters } = useSharedFilters();
  const [fuente, setFuente] = useState<Cliente360Fuente>("facturado");
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [search, setSearch] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("cliente") ?? "");
  const [page, setPage] = useState(0);
  const selectedMonths = Array.isArray(filters.meses) ? filters.meses : [];
  const data = useQuery({
    queryKey: ["cliente-360", fuente, filters],
    enabled: Boolean(session),
    queryFn: () => getCliente360({ fuente, anio: filters.anio, meses: selectedMonths.map(Number), unidades: filters.unidades, sucursales: filters.sucursales }),
  });
  const clientTableColumns = useMemo<ColumnDef<ClientSummary>[]>(
    () => [{ accessorKey: "cliente" }, { accessorKey: "monto", sortingFn: "basic" }],
    [],
  );
  const clients = useMemo(() => {
    const byClient = new Map<string, ClientSummary>();
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
  const selectedClient = useMemo(() =>
    selectedClientKey ? clients.find((client) => clientKey(client.cliente) === selectedClientKey) ?? null : null,
  [clients, selectedClientKey]);
  const selectedInvoice = selectedClient ? invoicesByClient.get(clientKey(selectedClient.cliente)) : undefined;
  const selectedReceivable = selectedClient ? receivablesByClient.get(clientKey(selectedClient.cliente)) : undefined;
  const filteredClients = useMemo(() => clients.filter((row) => row.cliente.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))), [clients, search]);
  const visibleAmount = filteredClients.reduce((sum, item) => sum + item.monto, 0);
  const positiveAmount = filteredClients.reduce((sum, item) => sum + Math.max(0, item.monto), 0);
  const leadingClients = filteredClients.filter((item) => item.monto > 0).slice(0, 5);
  const pageCount = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const clientTable = useReactTable({
    data: filteredClients,
    columns: clientTableColumns,
    state: {
      sorting: [{ id: "monto", desc: true }],
      pagination: { pageIndex: visiblePage, pageSize: PAGE_SIZE },
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const visibleClients = clientTable.getRowModel().rows.map((row) => row.original);

  return <div className="ccv-client-list-page flex flex-col gap-6">
    <PageHeader eyebrow="Gestión comercial" title="Cartera de clientes" description="Ranking agregado por facturación, cotizaciones o ventas perdidas. El saldo y la última factura son referencias disponibles para tu alcance." />
    <div className="ccv-client-toolbar flex flex-wrap items-center gap-2" role="group" aria-label="Fuente del ranking y búsqueda de clientes">
      {(["facturado", "cotizado", "perdido"] as Cliente360Fuente[]).map((value) => <button key={value} type="button" aria-pressed={fuente === value} onClick={() => { setFuente(value); setPage(0); }} className={`rounded-lg px-3 py-2 text-sm ${fuente === value ? "bg-primary text-primary-foreground" : "border border-border"}`}>{SOURCE_LABEL[value]}</button>)}
      <label htmlFor="cliente-search" className="sr-only">Buscar cliente por nombre</label>
      <input id="cliente-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar cliente por nombre" className="ml-auto h-10 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-sm" />
    </div>
    {data.isLoading ? <p className="text-sm text-muted-foreground">Cargando clientes…</p> : data.isError ? <QueryErrorNotice error={data.error} onRetry={() => void data.refetch()} fallback="No se pudieron cargar los clientes." /> : <>
      <section className="ccv-client-overview" aria-label="Resumen de la cartera visible">
        <div className="ccv-client-overview-total">
          <p>{SOURCE_LABEL[fuente]} · alcance actual</p>
          <strong className="tabular-nums">{money(visibleAmount)}</strong>
          <span>{filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}{search ? " en la búsqueda" : " en el período"}</span>
        </div>
        <div className="ccv-client-overview-leaders">
          <div className="ccv-client-overview-heading"><h2>Cinco principales clientes</h2><span>Del monto positivo</span></div>
          {leadingClients.length === 0 ? <p className="ccv-client-overview-empty">No hay montos positivos para mostrar.</p> : <ol>
            {leadingClients.map((item) => <li key={clientKey(item.cliente)}>
              <div><span title={item.cliente}>{item.cliente}</span><strong className="tabular-nums">{positiveAmount > 0 ? `${(item.monto / positiveAmount * 100).toFixed(1)} %` : "0 %"}</strong></div>
              <div className="ccv-client-overview-bar" aria-hidden="true"><span style={{ width: `${leadingClients[0]?.monto ? item.monto / leadingClients[0].monto * 100 : 0}%` }} /></div>
            </li>)}
          </ol>}
        </div>
      </section>
      <div className="ccv-client-table overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Clientes ordenados por monto {SOURCE_LABEL[fuente].toLocaleLowerCase("es")}</caption>
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 text-left text-muted-foreground backdrop-blur"><tr><th scope="col" className="p-3">Cliente</th><th scope="col" className="p-3 text-right">Monto {SOURCE_LABEL[fuente].toLocaleLowerCase("es")}</th><th scope="col" className="p-3 text-right">Saldo de cartera</th><th scope="col" className="p-3">Factura más reciente</th></tr></thead>
          <tbody>{visibleClients.map((item) => {
            const key = clientKey(item.cliente);
            const receivable = receivablesByClient.get(key);
            const invoice = invoicesByClient.get(key);
            return <tr key={key} className="border-b border-border/60"><th scope="row" className="p-3 text-left font-medium"><button type="button" className="rounded-sm text-left underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ver detalle de ${item.cliente}`} onClick={() => setSelectedClientKey(key)}>{item.cliente}</button></th><td className="p-3 text-right tabular-nums">{money(item.monto)}</td><td className="p-3 text-right tabular-nums">{money(Number(receivable?.saldo ?? 0))}</td><td className="p-3">{formatInvoiceDate(invoice?.fecha)}</td></tr>;
          })}
          {visibleClients.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>{search ? "No hay coincidencias para esa búsqueda." : "No hay clientes para estos filtros."}</td></tr>}</tbody>
        </table>
      </div>
      <Sheet open={selectedClient !== null} onOpenChange={(open) => { if (!open) setSelectedClientKey(null); }}>
        <SheetContent side="right" className="w-[min(100vw,28rem)] gap-0 p-0">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>{selectedClient?.cliente ?? "Detalle de cliente"}</SheetTitle>
            <SheetDescription>Resumen de la información ya disponible en la cartera actual.</SheetDescription>
          </SheetHeader>
          {selectedClient && <dl className="grid gap-4 p-5">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <dt className="text-xs text-muted-foreground">{SOURCE_LABEL[fuente]} · alcance actual</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{money(selectedClient.monto)}</dd>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">Saldo de cartera</dt>
                <dd className="mt-1 font-semibold tabular-nums">{money(Number(selectedReceivable?.saldo ?? 0))}</dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">Factura más reciente</dt>
                <dd className="mt-1 font-semibold">{formatInvoiceDate(selectedInvoice?.fecha)}</dd>
              </div>
            </div>
          </dl>}
        </SheetContent>
      </Sheet>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filteredClients.length === 0 ? "0 clientes" : `${visiblePage * PAGE_SIZE + 1}–${Math.min((visiblePage + 1) * PAGE_SIZE, filteredClients.length)} de ${filteredClients.length} clientes`}</span>
        <div className="flex gap-2"><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Anterior</button><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage >= pageCount - 1} onClick={() => setPage(visiblePage + 1)}>Siguiente</button></div>
      </div>
    </>}
  </div>;
}
