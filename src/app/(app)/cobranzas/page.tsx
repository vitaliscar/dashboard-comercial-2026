"use client";

import { useQuery } from "@tanstack/react-query";
import { getCobranzasAction, getCobranzasComparisonAction } from "@/lib/actions/cobranzas";
import { calcularParetoCobranzas, segmentarCobranzas } from "@/lib/analytics/cobranzas";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/ui/sparkline";
import { StatusPill } from "@/components/status-pill";
import { money } from "@/lib/format";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Wallet,
  AlertCircle,
  Search,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Building2,
  Layers,
} from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, LabelList } from "recharts";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/page-skeleton";

const BUCKET_ORDER = ["Vigente", "1-30 días", "31-60 días", "61-90 días", "+90 días"] as const;
const BUCKET_BAR_CLASS: Record<string, string> = {
  Vigente: "bg-success",
  "1-30 días": "bg-muted-foreground",
  "31-60 días": "bg-warning",
  "61-90 días": "bg-warning",
  "+90 días": "bg-danger",
};

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

export default function CobranzasPage() {
  const [q, setQ] = useState("");
  const { filters, setFilters } = useSharedFilters();
  const selectedUnidades = filters.unidades;
  const selectedSucursales = filters.sucursales;

  const { data: unidades } = useUnidades();
  const unitOptions = useMemo(() => {
    if (!unidades) return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades]);

  const { data: sucursalesData } = useSucursales();
  const sucursalOptions = useMemo(() => {
    if (!sucursalesData) return [];
    return sucursalesData.map((s) => ({ value: s.id, label: s.nombre }));
  }, [sucursalesData]);

  const handleSelectAllUnits = () => setFilters({ unidades: [] });
  const handleUnitSelectionChange = (unitIds: string[]) => setFilters({ unidades: unitIds });

  const handleSelectAllSucursales = () => setFilters({ sucursales: [] });
  const handleSucursalSelectionChange = (sucursalIds: string[]) =>
    setFilters({ sucursales: sucursalIds });

  const { data, isLoading } = useQuery({
    queryKey: ["cobranzas", selectedUnidades, selectedSucursales],
    queryFn: () => getCobranzasAction({ selectedUnidades, selectedSucursales }),
  });

  const { data: compData, isLoading: compLoading } = useQuery({
    queryKey: ["cobranzas-comparison", selectedUnidades, selectedSucursales],
    queryFn: () => getCobranzasComparisonAction({ selectedUnidades, selectedSucursales }),
  });

  const enriched = useMemo(() => {
    const today = new Date();
    return (data ?? []).map((c) => {
      const days = Math.floor(
        (today.getTime() - new Date(c.fechaVencimiento).getTime()) / 86400000,
      );
      return {
        ...c,
        dias: days,
        cubo: bucket(days),
        sucursal: c.sucursal ?? "Sin Sucursal",
        unidadNegocio: c.unidadNegocio ?? "Sin Unidad",
      };
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

  const pareto = useMemo(() => {
    return calcularParetoCobranzas(enriched);
  }, [enriched]);

  const segmentacion = useMemo(() => {
    return segmentarCobranzas(
      enriched.map((r) => ({
        sucursal: r.sucursal,
        unidadNegocio: r.unidadNegocio,
        saldo: Number(r.saldo) || 0,
      })),
    );
  }, [enriched]);

  const chartData = ["Vigente", "1-30 días", "31-60 días", "61-90 días", "+90 días"].map((k) => ({
    cubo: k,
    monto: totals[k] ?? 0,
  }));

  const isFiltroActivo = selectedUnidades.length > 0 || selectedSucursales.length > 0;
  const filtroActivoLabel = [
    ...selectedSucursales.map((id) => sucursalOptions.find((o) => o.value === id)?.label ?? id),
    ...selectedUnidades.map((id) => unitOptions.find((o) => o.value === id)?.label ?? id),
  ].join(", ");

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Cartera"
          title="Cobranzas"
          description="Cuentas por cobrar, análisis de tendencia, riesgo y concentración"
        />
        <PageSkeleton
          kpis={2}
          blocks={[
            { cols: 5, height: 100 },
            { cols: 3, height: 200 },
            { cols: 1, height: 300 },
            { cols: 2, height: 200 },
            { cols: 1, height: 260 },
            { cols: 1, height: 400 },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cartera"
        title="Cobranzas"
        description="Cuentas por cobrar, análisis de tendencia, riesgo y concentración"
      />

      {unitOptions.length > 0 && (
        <div className="bg-card border border-border shadow-sm rounded-md px-4 py-2.5 flex items-center gap-4 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground tracking-wide whitespace-nowrap">
            Filtrar por unidad:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={selectedUnidades.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={handleSelectAllUnits}
              className={cn(
                "h-auto rounded-full px-3.5 py-1 text-xs font-semibold",
                selectedUnidades.length === 0
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "text-muted-foreground",
              )}
            >
              Todas
            </Button>
            <ToggleGroup
              multiple
              value={selectedUnidades}
              onValueChange={handleUnitSelectionChange}
              spacing={2}
            >
              {unitOptions.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  variant="outline"
                  className="rounded-full px-3.5 py-1 text-xs font-semibold text-muted-foreground data-[pressed]:bg-foreground data-[pressed]:text-background data-[pressed]:border-border border border-transparent"
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )}

      {sucursalOptions.length > 1 && (
        <div className="bg-card border border-border shadow-sm rounded-md px-4 py-2.5 flex items-center gap-4 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground tracking-wide whitespace-nowrap">
            Filtrar por sucursal:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={selectedSucursales.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={handleSelectAllSucursales}
              className={cn(
                "h-auto rounded-full px-3.5 py-1 text-xs font-semibold",
                selectedSucursales.length === 0
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "text-muted-foreground",
              )}
            >
              Todas
            </Button>
            <ToggleGroup
              multiple
              value={selectedSucursales}
              onValueChange={handleSucursalSelectionChange}
              spacing={2}
            >
              {sucursalOptions.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  variant="outline"
                  className="rounded-full px-3.5 py-1 text-xs font-semibold text-muted-foreground data-[pressed]:bg-foreground data-[pressed]:text-background data-[pressed]:border-border border border-transparent"
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )}

      {/* KPI DESTACADO (bento span-2) + GAUGE DE % VENCIDO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="Total por cobrar"
          value={money(totalGeneral)}
          hint={`${enriched.length} facturas`}
          accent="primary"
          icon={Wallet}
          featured
        />
        <KpiCard
          label="Vencido"
          value={money(vencido)}
          hint="% del total en cartera"
          accent="warning"
          icon={AlertCircle}
          progress={totalGeneral > 0 ? (vencido / totalGeneral) * 100 : 0}
          progressVariant="gauge"
        />
      </div>

      {/* TARJETAS DE ANTIGÜEDAD POR DÍAS (5 PEQUEÑAS) */}
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

      {/* TENDENCIA SEMANAL */}
      {compLoading ? (
        <div className="card-elevated p-5 text-sm text-muted-foreground animate-pulse">
          Cargando tendencia semanal…
        </div>
      ) : !compData?.tieneHistorico ? (
        <div className="card-elevated p-5 bg-primary/5 ring-1 ring-primary/15 flex items-start gap-3">
          <AlertCircle className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="font-display font-semibold text-sm">Tendencia Semanal</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Esta es la primera carga registrada — la comparación semanal estará disponible después
              de la próxima actualización.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 flex flex-col justify-between">
            <KpiCard
              label="Tendencia semanal de vencido"
              value={`${compData.deltaVencido > 0 ? "+" : ""}${money(compData.deltaVencido)}`}
              hint={
                compData.deltaVencido <= 0
                  ? "El saldo vencido disminuyó vs. la semana anterior"
                  : "El saldo vencido aumentó vs. la semana anterior"
              }
              accent={compData.deltaVencido <= 0 ? "success" : "danger"}
              icon={compData.deltaVencido <= 0 ? TrendingDown : TrendingUp}
            />
          </div>
          <div className="lg:col-span-2 card-elevated p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-display font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" />
                Clientes con mayor incremento de saldo
              </h4>
              <span className="text-xs text-muted-foreground font-mono">Top 5</span>
            </div>
            {compData.clientesEmpeoraron.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Ningún cliente incrementó su saldo respecto a la semana anterior.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="py-2 px-3">Cliente</TableHead>
                      <TableHead className="py-2 px-3 text-right">Saldo anterior</TableHead>
                      <TableHead className="py-2 px-3 text-right">Saldo actual</TableHead>
                      <TableHead className="py-2 px-3">Tendencia</TableHead>
                      <TableHead className="py-2 px-3 text-right font-semibold">
                        Incremento
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compData.clientesEmpeoraron.map((c) => (
                      <TableRow key={c.cliente} className="hover:bg-muted/30">
                        <TableCell className="py-2 px-3 font-medium">
                          <Link
                            href={`/cliente-360?cliente=${encodeURIComponent(c.cliente)}`}
                            className="hover:underline text-primary font-semibold"
                          >
                            {c.cliente}
                          </Link>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {money(c.saldoAnterior)}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right tabular-nums font-medium">
                          {money(c.saldoActual)}
                        </TableCell>
                        <TableCell className="py-2 px-3 w-24">
                          <Sparkline
                            data={[c.saldoAnterior, c.saldoActual]}
                            tone="danger"
                            height={24}
                          />
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right tabular-nums font-semibold text-danger">
                          +{money(c.delta)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONCENTRACIÓN DE CARTERA (PARETO 80/20) */}
      <div className="card-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold">Concentración de cartera (Pareto 80/20)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clientes que concentran la mayor parte de las cuentas por cobrar
            </p>
          </div>
        </div>
        {pareto.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin datos de concentración
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-primary [&_tr]:border-b-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-primary-foreground py-2.5 px-3">Cliente</TableHead>
                  <TableHead className="text-primary-foreground py-2.5 px-3 text-right">
                    Saldo por cobrar
                  </TableHead>
                  <TableHead className="text-primary-foreground py-2.5 px-3 text-right">
                    % del total
                  </TableHead>
                  <TableHead className="text-primary-foreground py-2.5 px-3 text-right">
                    % Acumulado
                  </TableHead>
                  <TableHead className="text-primary-foreground py-2.5 px-3 text-center">
                    Estatus
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pareto.slice(0, 10).map((p) => (
                  <TableRow
                    key={p.cliente}
                    className="hover:bg-muted/40 border-b border-border/50 last:border-0"
                  >
                    <TableCell className="py-2.5 px-3 font-medium">
                      <Link
                        href={`/cliente-360?cliente=${encodeURIComponent(p.cliente)}`}
                        className="hover:underline text-primary font-semibold"
                      >
                        {p.cliente}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-right tabular-nums font-medium">
                      {money(p.saldo)}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                      {p.porcentaje.toFixed(1)}%
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      {p.porcentajeAcumulado.toFixed(1)}%
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-center">
                      <StatusPill kind={p.esTop80 ? "danger" : "neutral"}>
                        {p.esTop80 ? "Top 80%" : "Resto"}
                      </StatusPill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* SEGMENTACIÓN (SUCURSAL Y UNIDAD DE NEGOCIO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Desglose por Sucursal
          </h3>
          <div className="space-y-3">
            {segmentacion.porSucursal.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin datos por sucursal</p>
            ) : (
              segmentacion.porSucursal.map((s) => {
                const share = totalGeneral > 0 ? s.total / totalGeneral : 0;
                return (
                  <div key={s.sucursal}>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span>{s.sucursal}</span>
                      <span className="tabular-nums font-semibold">{money(s.total)}</span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label={s.sucursal}
                      aria-valuenow={Math.round(share * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="progress-fill bg-primary"
                        style={{ transform: `scaleX(${share})` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            Desglose por Unidad de Negocio
          </h3>
          <div className="space-y-3">
            {segmentacion.porUnidad.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin datos por unidad</p>
            ) : (
              segmentacion.porUnidad.map((u) => {
                const share = totalGeneral > 0 ? u.total / totalGeneral : 0;
                return (
                  <div key={u.unidad}>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span>{u.unidad}</span>
                      <span className="tabular-nums font-semibold">{money(u.total)}</span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label={u.unidad}
                      aria-valuenow={Math.round(share * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="progress-fill bg-primary"
                        style={{ transform: `scaleX(${share})` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* GRÁFICO DE ANTIGÜEDAD DE SALDOS */}
      <div
        className={cn(
          "card-elevated p-5",
          isFiltroActivo && "ring-1 ring-primary/40 border-primary/40",
        )}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-display font-semibold">Antigüedad de saldos</h3>
          {isFiltroActivo ? (
            <StatusPill kind="neutral">Filtrado: {filtroActivoLabel}</StatusPill>
          ) : (
            <span className="text-[11px] text-muted-foreground font-mono">Todas</span>
          )}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="cubo" stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                formatter={((v: unknown) => money(Number(v))) as never}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 0,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-foreground)" }}
                itemStyle={{ color: "var(--color-foreground)" }}
              />
              <Bar
                dataKey="monto"
                fill={isFiltroActivo ? "var(--color-ochre)" : "var(--color-primary)"}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="monto"
                  position="top"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--color-foreground)"
                  formatter={((v: unknown) => money(Number(v))) as never}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA DE DETALLE */}
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
        <div className="[&_[data-slot=table-container]]:max-h-[26rem] [&_[data-slot=table-container]]:overflow-y-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary [&_tr]:border-b-0 sticky top-0 z-10">
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
                        <EmptyMedia variant="icon">
                          <CircleCheck className="text-success" />
                        </EmptyMedia>
                        <EmptyTitle>No hay cuentas por cobrar pendientes</EmptyTitle>
                        <EmptyDescription>
                          Todas las cuentas están al día para la sucursal y el período
                          seleccionados.
                        </EmptyDescription>
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
