import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCobranzasFn } from "@/lib/server/cobranzas";
import { KpiCard } from "@/components/kpi-card";
import { StatusPill } from "@/components/status-pill";
import { money } from "@/lib/format";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Wallet, AlertCircle, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

const BUCKET_ORDER = ["Vigente", "1-30 días", "31-60 días", "61-90 días", "+90 días"] as const;
const BUCKET_BAR_CLASS: Record<string, string> = {
  Vigente: "bg-success",
  "1-30 días": "bg-muted-foreground",
  "31-60 días": "bg-warning",
  "61-90 días": "bg-warning",
  "+90 días": "bg-danger",
};

export const Route = createFileRoute("/_app/cobranzas")({
  head: () => ({ meta: [{ title: "Cobranzas · CCV" }] }),
  component: Cobranzas,
});

function bucket(days: number) {
  if (days <= 0) return "Vigente";
  if (days <= 30) return "1-30 días";
  if (days <= 60) return "31-60 días";
  if (days <= 90) return "61-90 días";
  return "+90 días";
}
function bucketKind(b: string): "success" | "warning" | "danger" | "neutral" {
  if (b === "Vigente") return "success";
  if (b === "1-30 días") return "neutral";
  if (b === "31-60 días" || b === "61-90 días") return "warning";
  return "danger";
}

function Cobranzas() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["cobranzas"],
    queryFn: () => getCobranzasFn(),
  });

  const enriched = useMemo(() => {
    const today = new Date();
    return (data ?? []).map((c) => {
      const days = Math.floor(
        (today.getTime() - new Date(c.fechaVencimiento).getTime()) / 86400000,
      );
      return { ...c, dias: days, cubo: bucket(days) };
    });
  }, [data]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return enriched.filter(
      (r) =>
        r.cliente.toLowerCase().includes(s) || (r.facturaNumero ?? "").toLowerCase().includes(s),
    );
  }, [enriched, q]);

  const totals = useMemo(() => {
    const t = {
      vigente: 0,
      "1-30 días": 0,
      "31-60 días": 0,
      "61-90 días": 0,
      "+90 días": 0,
    } as Record<string, number>;
    enriched.forEach((r) => (t[r.cubo] = (t[r.cubo] ?? 0) + Number(r.saldo)));
    return t;
  }, [enriched]);

  const totalGeneral = Object.values(totals).reduce((a, b) => a + b, 0);
  const vencido = totalGeneral - (totals["Vigente"] ?? 0);

  const chartData = ["Vigente", "1-30 días", "31-60 días", "61-90 días", "+90 días"].map((k) => ({
    cubo: k,
    monto: totals[k] ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Cartera"
        title="Cobranzas"
        description="Cuentas por cobrar y análisis de antigüedad"
      />

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        {BUCKET_ORDER.map((k) => {
          const monto = totals[k] ?? 0;
          const share = totalGeneral > 0 ? monto / totalGeneral : 0;
          return (
            <div key={k} className="card-elevated p-4">
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold">
                {k}
              </p>
              <p className="font-display text-lg font-bold mt-1 tabular-nums">{money(monto)}</p>
              <div
                className="progress-track mt-3"
                role="progressbar"
                aria-label={k}
                aria-valuenow={Math.round(share * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={cn("progress-fill", BUCKET_BAR_CLASS[k])}
                  style={{ transform: `scaleX(${share})` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Solo agregados que NO repiten un valor ya mostrado en las tarjetas de antigüedad de
          arriba (Vigente y +90 días ya están ahí — mostrarlos otra vez aquí era duplicado). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="Total por cobrar"
          value={money(totalGeneral)}
          hint={`${enriched.length} facturas`}
          accent="primary"
          icon={Wallet}
        />
        <KpiCard
          label="Vencido"
          value={money(vencido)}
          hint={`${totalGeneral > 0 ? ((vencido / totalGeneral) * 100).toFixed(1) : "0"}% del total`}
          accent="warning"
          icon={AlertCircle}
        />
      </div>

      <div className="card-elevated p-5">
        <h3 className="font-display font-semibold mb-4">Antigüedad de saldos</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="cubo" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <Tooltip
                formatter={((v: unknown) => money(Number(v))) as never}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 0,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="monto" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <h3 className="font-display font-semibold">Detalle de cuentas por cobrar</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente o factura…"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
                  Cliente
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
                  Factura
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
                  Vencimiento
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 font-medium text-xs tracking-wider">
                  Días
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 font-medium text-xs tracking-wider">
                  Monto
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
                  Antigüedad
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          No hay cuentas por cobrar pendientes
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="px-4 py-3 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {r.facturaNumero ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-muted-foreground">
                      {r.fechaVencimiento}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">{r.dias}</TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums font-medium">
                      {money(Number(r.saldo))}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusPill kind={bucketKind(r.cubo)}>{r.cubo}</StatusPill>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
