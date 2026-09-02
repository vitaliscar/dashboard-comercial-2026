import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCliente360, type Cliente360Fuente } from "@/lib/cliente-360-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { money } from "@/lib/format";

export default function Cliente360Page() {
  const { session } = useAuth(); const { filters } = useSharedFilters(); const [fuente, setFuente] = useState<Cliente360Fuente>("facturado");
  const selectedMonths = Array.isArray(filters.meses) ? filters.meses : [];
  const data = useQuery({ queryKey: ["cliente-360", fuente, filters], enabled: Boolean(session), queryFn: () => getCliente360({ fuente, anio: filters.anio, mes: selectedMonths.length === 1 ? Number(selectedMonths[0]) : 0, unidades: filters.unidades, sucursales: filters.sucursales }) });
  const clients = useMemo(() => [...(data.data?.pareto ?? [])].sort((a, b) => Number(b.monto) - Number(a.monto)), [data.data]);
  return <div className="flex flex-col gap-6"><PageHeader eyebrow="Gestión comercial" title="Cliente 360" description="Valor, última facturación, pérdidas y cartera de clientes visibles." />
    <div className="flex gap-2">{(["facturado", "cotizado", "perdido"] as Cliente360Fuente[]).map((value) => <button key={value} onClick={() => setFuente(value)} className={`rounded-lg px-3 py-2 text-sm ${fuente === value ? "bg-primary text-primary-foreground" : "border border-border"}`}>{value}</button>)}</div>
    {data.isLoading ? <p className="text-sm text-muted-foreground">Cargando clientes…</p> : data.isError ? <p className="text-sm text-danger">{data.error.message}</p> : <div className="overflow-hidden rounded-xl border border-border bg-card"><table className="w-full text-sm"><thead className="border-b border-border text-left text-muted-foreground"><tr><th className="p-3">Cliente</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Cartera</th><th className="p-3">Última factura</th></tr></thead><tbody>{clients.map((item) => { const receivable = data.data?.cobranzas.find((r) => r.cliente === item.cliente); const invoice = data.data?.facturas.find((r) => r.cliente === item.cliente); return <tr key={`${item.cliente}-${item.sucursalId ?? ""}`} className="border-b border-border/60"><td className="p-3 font-medium">{item.cliente}</td><td className="p-3 text-right">{money(Number(item.monto))}</td><td className="p-3 text-right">{money(Number(receivable?.saldo ?? 0))}</td><td className="p-3">{invoice?.fecha ?? "—"}</td></tr>; })}{clients.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>No hay clientes para estos filtros.</td></tr>}</tbody></table></div>}</div>;
}