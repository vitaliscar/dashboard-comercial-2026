"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import {
  getAlquilerFacturacionAction,
  getAlquilerPresupuestoAction,
  getAlquilerClientesCobroAction,
} from "@/lib/actions/alquiler";
import { useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Bar,
  ComposedChart,
} from "recharts";
import { Truck, TrendingUp, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

export default function Alquiler() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const [searchClientes, setSearchClientes] = useState("");

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses });
  };

  const { data: sucursales } = useSucursales();

  const { data: facturacionMensual } = useQuery({
    queryKey: ["alquiler-facturacion", anio],
    queryFn: async () => {
      const rows = await getAlquilerFacturacionAction({ anio });
      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i].slice(0, 3),
        facturado: 0,
      }));
      rows.forEach((r) => {
        const m = new Date(r.fecha).getMonth();
        byMonth[m].facturado += Number(r.monto);
      });
      return byMonth;
    },
  });

  const { data: presupuestoData } = useQuery({
    queryKey: ["alquiler-presupuesto", anio, JSON.stringify(meses)],
    queryFn: () => getAlquilerPresupuestoAction({ anio, meses }),
  });

  const { data: clientesCobro } = useQuery({
    queryKey: ["alquiler-clientes-cobro"],
    queryFn: () => getAlquilerClientesCobroAction(),
  });

  const kpis = useMemo(() => {
    const pres = presupuestoData ?? [];
    const presupuesto = pres.reduce((a, r) => a + Number(r.monto || 0), 0);
    const facturadoYtd = (facturacionMensual ?? []).reduce((a, r) => a + r.facturado, 0);
    const clientes = (clientesCobro ?? []).length;
    const cumplimiento = presupuesto > 0 ? (facturadoYtd / presupuesto) * 100 : 0;
    return { presupuesto, facturadoYtd, clientes, cumplimiento };
  }, [presupuestoData, facturacionMensual, clientesCobro]);

  const clientesFiltrados = useMemo(() => {
    const s = searchClientes.toLowerCase();
    return (clientesCobro ?? [])
      .filter((r) => r.cliente.toLowerCase().includes(s))
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
  }, [clientesCobro, searchClientes]);

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Unidad de Negocio"
        title="Dashboard Comercial - Alquiler"
        description="Seguimiento de facturacion, cumplimiento presupuestario y cuentas por cobrar por cliente."
      />

      <div className="card-elevated p-4 section-enter section-enter-1">
        <FilterHeader
          onApplyFilters={handleApplyFilters}
          sucursalOptions={
            role === "gerencia"
              ? sucursales?.map((s) => ({ value: s.id, label: s.nombre }))
              : undefined
          }
          defaultMes={meses}
          defaultAnio={anio}
          showAllMonths
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 section-enter section-enter-1">
        <KpiCard
          label="Facturado YTD"
          value={money(kpis.facturadoYtd)}
          hint="acumulado del año"
          accent="success"
          icon={TrendingUp}
        />
        <KpiCard
          label="Presupuesto"
          value={money(kpis.presupuesto)}
          hint="meta anual"
          accent="primary"
          icon={FileText}
        />
        <KpiCard
          label="Cumplimiento"
          value={`${kpis.cumplimiento.toFixed(1)}%`}
          hint="vs presupuesto"
          accent="warning"
          icon={TrendingUp}
        />
        <KpiCard
          label="Clientes con Saldo"
          value={String(kpis.clientes)}
          hint="cuentas por cobrar"
          accent="ochre"
          icon={Truck}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 section-enter section-enter-2">
        <div className="card-elevated p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Facturación Mensual Alquiler</h3>
            <p className="text-xs text-muted-foreground">{anio} — Facturado vs Presupuesto</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={facturacionMensual ?? []}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "2px solid var(--color-foreground)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="presupuesto"
                  fill="var(--color-muted-foreground)"
                  name="Presupuesto"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="facturado"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  name="Facturado"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Cumplimiento anual</h3>
          <p className="text-xs text-muted-foreground mb-4">Facturado vs presupuesto</p>
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{kpis.cumplimiento.toFixed(1)}%</div>
              <p className="text-sm text-muted-foreground mt-2">del presupuesto</p>
              <p className="text-xs text-muted-foreground mt-1">
                {money(kpis.facturadoYtd)} de {money(kpis.presupuesto)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Trend line */}
      <div className="card-elevated p-5 section-enter section-enter-2">
        <div className="mb-4">
          <h3 className="font-display font-semibold">Tendencia anual</h3>
          <p className="text-xs text-muted-foreground">
            Evolución mensual de ingresos por alquiler
          </p>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={facturacionMensual ?? []}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <Tooltip
                formatter={((v: unknown) => money(Number(v))) as never}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "2px solid var(--color-foreground)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="facturado"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="Facturado"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clientes cuentas por cobrar */}
      <div className="card-elevated overflow-hidden section-enter section-enter-3">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold">Clientes — Cuentas por Cobrar</h3>
            <p className="text-xs text-muted-foreground">Saldos pendientes de alquiler</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchClientes}
              onChange={(e) => setSearchClientes(e.target.value)}
              placeholder="Buscar cliente…"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-accent [&_tr]:border-b-0 border-b border-border">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-accent-foreground text-left px-4 py-2.5 font-semibold text-xs tracking-wider uppercase">
                  Cliente
                </TableHead>
                <TableHead className="text-accent-foreground text-right px-4 py-2.5 font-semibold text-xs tracking-wider uppercase">
                  Factura Total
                </TableHead>
                <TableHead className="text-accent-foreground text-right px-4 py-2.5 font-semibold text-xs tracking-wider uppercase">
                  Saldo
                </TableHead>
                <TableHead className="text-accent-foreground text-left px-4 py-2.5 font-semibold text-xs tracking-wider uppercase">
                  Sucursal
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin clientes con saldo pendiente
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                clientesFiltrados.map((r, i) => (
                  <TableRow
                    key={i}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="px-4 py-3 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">
                      {money(Number(r.monto))}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums font-medium text-danger">
                      {money(Number(r.saldo))}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground text-sm">
                      {sucursales?.find((s) => s.id === r.sucursalId)?.nombre || "—"}
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
