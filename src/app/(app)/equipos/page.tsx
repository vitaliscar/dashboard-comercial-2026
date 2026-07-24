"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getDateRangesForMonths } from "@/lib/date-range";
import {
  getEquiposFacturacionAction,
  getEquiposPresupuestoAction,
  getEquiposVentasPerdidasAction,
  getEquiposClientesCobroAction,
} from "@/lib/actions/equipos";
import { useMemo, useState } from "react";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar } from "recharts";
import { Truck, TrendingUp, FileText, Search, Package } from "lucide-react";
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

export default function Equipos() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const [searchClientes, setSearchClientes] = useState("");

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses });
  };

  const { data: sucursales } = useSucursales();

  const { data: facturacionMensual } = useQuery({
    queryKey: ["equipos-facturacion", anio],
    queryFn: async () => {
      const rows = await getEquiposFacturacionAction({ anio });
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
    queryKey: ["equipos-presupuesto", anio, JSON.stringify(meses)],
    queryFn: () => getEquiposPresupuestoAction({ anio, meses }),
  });

  const { data: ventasPerdidas } = useQuery({
    queryKey: ["equipos-ventas-perdidas", anio, JSON.stringify(meses)],
    queryFn: () => getEquiposVentasPerdidasAction({ ranges: dateRanges }),
  });

  const { data: clientesCobro } = useQuery({
    queryKey: ["equipos-clientes-cobro"],
    queryFn: () => getEquiposClientesCobroAction(),
  });

  const kpis = useMemo(() => {
    const pres = presupuestoData ?? [];
    const presupuesto = pres.reduce((a, r) => a + Number(r.monto || 0), 0);
    const facturado = (facturacionMensual ?? []).reduce((a, r) => a + r.facturado, 0);
    const cumplimiento = presupuesto > 0 ? (facturado / presupuesto) * 100 : 0;
    return { presupuesto, facturado, cumplimiento };
  }, [presupuestoData, facturacionMensual]);

  const clientesFiltrados = useMemo(() => {
    const s = searchClientes.toLowerCase();
    return (clientesCobro ?? [])
      .filter((r) => r.cliente.toLowerCase().includes(s))
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
  }, [clientesCobro, searchClientes]);

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard comercial</h1>
      </div>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Facturado"
          value={money(kpis.facturado)}
          hint="período seleccionado"
          accent="success"
          icon={TrendingUp}
        />
        <KpiCard
          label="Presupuesto"
          value={money(kpis.presupuesto)}
          hint="meta anual"
          accent="primary"
          icon={Package}
        />
        <KpiCard
          label="Cumplimiento"
          value={`${kpis.cumplimiento.toFixed(1)}%`}
          hint="vs presupuesto"
          accent="warning"
          icon={Truck}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Facturación mensual</h3>
            <p className="text-xs text-muted-foreground">{anio}</p>
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
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="facturado" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Ventas perdidas</h3>
          <p className="text-xs text-muted-foreground mb-4">Oportunidades no concretadas</p>
          <div className="h-64">
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {(ventasPerdidas?.length ?? 0) === 0 ? (
                <div className="text-center text-sm">
                  <p>Sin ventas perdidas registradas</p>
                  <p className="text-xs mt-1">en el período</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {money((ventasPerdidas ?? []).reduce((a, r) => a + Number(r.monto || 0), 0))}
                  </p>
                  <p className="text-xs mt-2">en oportunidades</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 - Ventas Perdidas detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
        <div className="card-elevated p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Detalle de Ventas Perdidas</h3>
            <p className="text-xs text-muted-foreground">
              Análisis de oportunidades no concretadas
            </p>
          </div>
          {(ventasPerdidas?.length ?? 0) === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              Sin ventas perdidas registradas en el período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader className="bg-primary [&_tr]:border-b-0">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                      Cliente
                    </TableHead>
                    <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                      Razón
                    </TableHead>
                    <TableHead className="text-primary-foreground text-right px-4 py-2 font-medium text-xs">
                      Monto
                    </TableHead>
                    <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                      Fecha
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ventasPerdidas ?? []).slice(0, 8).map((r, i) => (
                    <TableRow
                      key={i}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                    >
                      <TableCell className="px-4 py-2 font-medium">{r.cliente || "—"}</TableCell>
                      <TableCell className="px-4 py-2 text-muted-foreground text-xs">
                        {r.razon || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right tabular-nums">
                        {money(Number(r.monto))}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-muted-foreground text-xs">
                        {r.fecha?.slice(0, 10)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Clientes cuentas por cobrar */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <h3 className="font-display font-semibold">Clientes - Cuentas por Cobrar</h3>
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
            <TableHeader className="bg-primary [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
                  Cliente
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 font-medium text-xs tracking-wider">
                  Factura Total
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 font-medium text-xs tracking-wider">
                  Saldo
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 font-medium text-xs tracking-wider">
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
