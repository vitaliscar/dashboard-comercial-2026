"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, Shield, TrendingUp, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { getCliente360DataAction, type Cliente360Fuente } from "@/lib/actions/cliente-360";
import { getParetoDataAction, type ParetoFuente } from "@/lib/actions/pareto";
import { money, pct, diasEntre } from "@/lib/format";
import { canAccessModule } from "@/lib/permissions";
import { computeHealthScore, healthBand, type HealthBand } from "@/lib/analytics/health-score";
import { computeParetoSummary, type ParetoInputRow } from "@/lib/analytics/pareto";
import { resolverAsesor } from "@/lib/asesores-catalogo";
import { KpiCard } from "@/components/kpi-card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/status-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// ─── constantes ───────────────────────────────────────────────────────────────

const MESES_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const FUENTE_CLIENTE_TITULO: Record<Cliente360Fuente, string> = {
  cotizado: "Cotizado",
  facturado: "Facturado",
  perdido: "Ventas Perdidas",
};

const FUENTE_PARETO_TITULO: Record<ParetoFuente, string> = {
  cotizado: "Cotizaciones acumuladas",
  facturado: "Facturado real",
  perdido: "Ventas perdidas acumuladas",
};

const BAND_KIND: Record<HealthBand, "success" | "warning" | "danger"> = {
  sano: "success",
  atencion: "warning",
  riesgo: "danger",
};
const BAND_LABEL: Record<HealthBand, string> = {
  sano: "Sano",
  atencion: "Atención",
  riesgo: "Riesgo",
};

const CLASIFICACION_KIND: Record<"A" | "B" | "C", "success" | "warning" | "neutral"> = {
  A: "success",
  B: "warning",
  C: "neutral",
};

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ─── Shared filter bar ───────────────────────────────────────────────────────

// ─── Pareto Asesores tab ─────────────────────────────────────────────────────

function ParetoAsesoresTab({
  anio,
  mes,
}: {
  anio: number;
  mes: number;
}) {
  const { role } = useAuth();
  const [fuente, setFuente] = useState<ParetoFuente>("facturado");
  const canView = role === "gerencia" || role === "gerente_comercial";

  const { data, isLoading } = useQuery({
    queryKey: ["pareto", fuente, anio, mes],
    enabled: canView,
    queryFn: () => getParetoDataAction({ fuente, anio, mes }),
  });

  const { rows, totalGeneral, top20Count, top20Sum, top20Share } = useMemo(() => {
    const grouped = new Map<string, { monto: number }>();
    (data ?? []).forEach((r) => {
      const val = (r.asesor ?? "") as string;
      const resolved = resolverAsesor(fuente === "cotizado" ? { codigo: val } : { nombre: val });
      const key = resolved.nombre;
      if (!key) return;
      const curr = grouped.get(key) ?? { monto: 0 };
      curr.monto += Number(r.monto ?? 0);
      grouped.set(key, curr);
    });

    const input: ParetoInputRow[] = Array.from(grouped.entries()).map(([key, v]) => ({
      key,
      monto: v.monto,
    }));

    return computeParetoSummary(input);
  }, [data, fuente]);

  const vitalesRows = useMemo(() => rows.filter((r) => r.clasificacion === "A"), [rows]);
  const chartData = useMemo(() => vitalesRows.slice(0, 15), [vitalesRows]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      monto: { label: FUENTE_PARETO_TITULO[fuente], color: "var(--color-primary)" },
      acumulado: { label: "% Acumulado", color: "var(--color-destructive)" },
    }),
    [fuente],
  );

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2 mx-auto mt-4">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Sólo los perfiles Gerencia Nacional y Gerente Comercial pueden ver el Pareto de asesores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Fuente selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <Tabs value={fuente} onValueChange={(v) => setFuente(v as ParetoFuente)}>
          <TabsList>
            <TabsTrigger value="cotizado">Cotizado</TabsTrigger>
            <TabsTrigger value="facturado">Facturado</TabsTrigger>
            <TabsTrigger value="perdido">Ventas perdidas</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {vitalesRows.length} asesores vitales concentran el 80% de {FUENTE_PARETO_TITULO[fuente].toLowerCase()}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={`Total ${FUENTE_PARETO_TITULO[fuente]}`}
          value={money(totalGeneral)}
          icon={Wallet}
          hint={`${rows.length} asesores en total`}
        />
        <KpiCard
          label={`Top ${top20Count} (20%)`}
          value={money(top20Sum)}
          icon={TrendingUp}
          hint={`representa el ${pct(top20Share, 1)}`}
        />
        <KpiCard
          label="Asesores vitales"
          value={String(vitalesRows.length)}
          icon={Shield}
          accent="ochre"
          hint={`concentran el 80% de ${FUENTE_PARETO_TITULO[fuente].toLowerCase()}`}
        />
      </div>

      {/* Gráfico */}
      <div className="card-elevated p-5">
        <h3 className="font-display font-semibold mb-1">
          Asesores vitales — {FUENTE_PARETO_TITULO[fuente]}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {chartData.length} asesores que generan el 80% · barras = monto · línea = % acumulado
        </p>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} layout="vertical" margin={{ left: 10, right: 60, top: 5, bottom: 5 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => money(v)} />
              <YAxis type="category" yAxisId="left" dataKey="nombre" stroke="var(--color-muted-foreground)" fontSize={11} width={160} tick={{ textAnchor: "end" }} />
              <YAxis type="number" yAxisId="right" orientation="right" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {name === "acumulado" ? `${Number(value).toFixed(1)}%` : money(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar yAxisId="left" dataKey="monto" fill="var(--color-monto)" radius={[0, 4, 4, 0]} barSize={18} />
              <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="var(--color-acumulado)" strokeWidth={2.5} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={80} stroke="var(--color-destructive)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Tabla */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold">Asesores vitales (80%)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vitalesRows.length} asesores · agrupados a nivel nacional
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground sticky top-0 [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider w-12 text-primary-foreground">#</TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">Asesor</TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">Monto</TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">% del total</TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">% Acumulado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vitalesRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin datos para el período seleccionado
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                vitalesRows.map((r, i) => (
                  <TableRow key={r.nombre} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
                    <TableCell className="px-4 py-2.5 font-medium text-sm">{r.nombre}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums font-medium">{money(r.monto)}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">{pct(r.share, 1)}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums font-medium">{pct(r.acumulado, 1)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}

// ─── Clientes 360° tab ───────────────────────────────────────────────────────

function Clientes360Tab({
  anio,
  mes,
  sucursalId,
  selectedUnidades,
  initialSearch,
}: {
  anio: number;
  mes: number;
  sucursalId: string | undefined;
  selectedUnidades: string[];
  initialSearch: string;
}) {
  const { role, profile } = useAuth();
  const canView = canAccessModule(role, "cliente_360");
  const [search, setSearch] = useState(initialSearch);
  const [fuente, setFuente] = useState<Cliente360Fuente>("facturado");

  const hoy = useMemo(() => new Date(), []);

  const { data, isLoading } = useQuery({
    queryKey: ["cliente-360", fuente, anio, mes, sucursalId, selectedUnidades, role, profile?.id],
    enabled: canView,
    queryFn: () =>
      getCliente360DataAction({
        fuente,
        anio,
        mes,
        sucursalId,
        unidades: selectedUnidades,
      }),
  });

  const { rows, top20Count, top20Sum, top20Share, vitalesCount } = useMemo(() => {
    if (!data) {
      return { rows: [], totalGeneral: 0, top20Count: 0, top20Sum: 0, top20Share: 0, vitalesCount: 0 };
    }

    const porCliente = new Map<
      string,
      {
        nombre: string;
        montoPareto: number;
        sucursales: Set<string>;
        ltv: number;
        ultimaFecha: Date | null;
        saldoVencido: number;
        diasVencidoMax: number;
        montoPerdidoReciente: number;
      }
    >();

    const upsert = (nombre: string) => {
      const key = normalize(nombre);
      if (!key) return null;
      let e = porCliente.get(key);
      if (!e) {
        e = { nombre, montoPareto: 0, sucursales: new Set<string>(), ltv: 0, ultimaFecha: null, saldoVencido: 0, diasVencidoMax: 0, montoPerdidoReciente: 0 };
        porCliente.set(key, e);
      }
      return e;
    };

    data.pareto.forEach((p) => {
      const e = upsert(p.cliente);
      if (!e) return;
      e.montoPareto += Number(p.monto) || 0;
      if (p.sucursal_id) e.sucursales.add(p.sucursal_id);
    });

    data.facturas.forEach((f) => {
      const e = upsert(f.cliente);
      if (!e) return;
      e.ltv += Number(f.monto) || 0;
      const fecha = new Date(f.fecha);
      if (!isNaN(fecha.getTime()) && (!e.ultimaFecha || fecha > e.ultimaFecha)) e.ultimaFecha = fecha;
    });

    data.ventasPerdidas.forEach((v) => {
      const e = upsert(v.cliente);
      if (!e) return;
      e.montoPerdidoReciente += Number(v.monto) || 0;
    });

    data.cobranzas.forEach((c) => {
      const e = upsert(c.cliente);
      if (!e) return;
      e.saldoVencido += Number(c.saldo) || 0;
      const dias = diasEntre(c.fechaVencimiento, hoy);
      if (dias > e.diasVencidoMax) e.diasVencidoMax = dias;
    });

    const paretoInput: ParetoInputRow[] = Array.from(porCliente.values()).map((e) => ({
      key: e.nombre,
      monto: e.montoPareto,
    }));

    const summary = computeParetoSummary(paretoInput);

    const unifiedRows = summary.rows.map((pRow) => {
      const key = normalize(pRow.nombre);
      const entry = porCliente.get(key);

      const ltv = entry ? Math.round(entry.ltv * 100) / 100 : 0;
      const saldoVencido = entry ? Math.round(entry.saldoVencido * 100) / 100 : 0;
      const diasVencidoMax = entry ? Math.max(0, entry.diasVencidoMax) : 0;
      const recenciaDias = entry && entry.ultimaFecha ? diasEntre(entry.ultimaFecha, hoy) : null;
      const montoPerdidoReciente = entry ? Math.round(entry.montoPerdidoReciente * 100) / 100 : 0;

      const health = computeHealthScore({ diasVencidoMax, saldoVencido, recenciaDias: recenciaDias ?? 365, montoPerdidoReciente, ltv });
      const band = healthBand(health);

      return {
        cliente: pRow.nombre,
        sucursalesCount: entry ? entry.sucursales.size : 0,
        montoPareto: pRow.monto,
        share: pRow.share,
        acumulado: pRow.acumulado,
        clasificacion: pRow.clasificacion,
        health,
        band,
        saldoVencido,
        diasVencidoMax,
        recenciaDias,
        ltv,
      };
    });

    const vitalesCount = unifiedRows.filter((r) => r.clasificacion === "A").length;

    return {
      rows: unifiedRows,
      totalGeneral: summary.totalGeneral,
      top20Count: summary.top20Count,
      top20Sum: summary.top20Sum,
      top20Share: summary.top20Share,
      vitalesCount,
    };
  }, [data, hoy]);

  const vitalesRows = useMemo(() => rows.filter((r) => r.clasificacion === "A"), [rows]);
  const chartData = useMemo(() => vitalesRows.slice(0, 15), [vitalesRows]);

  const chartConfig: ChartConfig = useMemo(
    () => ({
      montoPareto: { label: FUENTE_CLIENTE_TITULO[fuente], color: "var(--color-primary)" },
      acumulado: { label: "% Acumulado", color: "var(--color-destructive)" },
    }),
    [fuente],
  );

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = normalize(search);
    return rows.filter((r) => normalize(r.cliente).includes(q));
  }, [rows, search]);

  const kpis = useMemo(() => {
    const enRiesgo = rows.filter((r) => r.band === "riesgo").length;
    const saldoTotalVencido = rows.reduce((a, r) => a + r.saldoVencido, 0);
    const ltvTotal = rows.reduce((a, r) => a + r.ltv, 0);
    return { total: rows.length, enRiesgo, saldoTotalVencido, ltvTotal, top20Count, top20Sum, top20Share, vitalesCount };
  }, [rows, top20Count, top20Sum, top20Share, vitalesCount]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2 mx-auto mt-4">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Fuente tabs */}
      <div className="flex flex-wrap gap-3 items-center">
        <Tabs value={fuente} onValueChange={(v) => setFuente(v as Cliente360Fuente)}>
          <TabsList>
            <TabsTrigger value="cotizado">Cotizado</TabsTrigger>
            <TabsTrigger value="facturado">Facturado</TabsTrigger>
            <TabsTrigger value="perdido">Ventas perdidas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Clientes" value={String(kpis.total)} accent="primary" icon={Users} />
        <KpiCard label="En riesgo" value={String(kpis.enRiesgo)} accent={kpis.enRiesgo > 0 ? "danger" : "success"} />
        <KpiCard label="Saldo vencido total" value={money(kpis.saldoTotalVencido)} accent="warning" />
        <KpiCard label="LTV histórico total" value={money(kpis.ltvTotal)} accent="success" />
        <KpiCard label={`Top ${kpis.top20Count} (20%)`} value={money(kpis.top20Sum)} icon={TrendingUp} hint={`representa el ${pct(kpis.top20Share, 1)}`} />
        <KpiCard label="Clientes vitales" value={String(kpis.vitalesCount)} icon={Shield} accent="ochre" hint={`concentran el 80% de ${FUENTE_CLIENTE_TITULO[fuente].toLowerCase()}`} />
      </div>

      {/* GRÁFICO PARETO */}
      <div className="card-elevated p-5">
        <h3 className="font-display font-semibold mb-1">Clientes vitales — {FUENTE_CLIENTE_TITULO[fuente]}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {chartData.length} clientes que generan el 80% · barras = monto · línea = % acumulado
        </p>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} layout="vertical" margin={{ left: 10, right: 60, top: 5, bottom: 5 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => money(v)} />
              <YAxis type="category" yAxisId="left" dataKey="cliente" stroke="var(--color-muted-foreground)" fontSize={11} width={160} tick={{ textAnchor: "end" }} />
              <YAxis type="number" yAxisId="right" orientation="right" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {name === "acumulado" ? `${Number(value).toFixed(1)}%` : money(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar yAxisId="left" dataKey="montoPareto" fill="var(--color-montoPareto)" radius={[0, 4, 4, 0]} barSize={18} />
              <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="var(--color-acumulado)" strokeWidth={2.5} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={80} stroke="var(--color-destructive)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* TABLA */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Detalle por Cliente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salud, concentración Pareto ({FUENTE_CLIENTE_TITULO[fuente]}) y morosidad
            </p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="[&_[data-slot=table-container]]:max-h-[26rem] [&_[data-slot=table-container]]:overflow-y-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary [&_tr]:border-b-0 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-3 py-2 text-xs tracking-wider w-12">#</TableHead>
                <TableHead className="text-primary-foreground text-left px-3 py-2 text-xs tracking-wider">Cliente</TableHead>
                <TableHead className="text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">Suc.</TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">Monto ({FUENTE_CLIENTE_TITULO[fuente]})</TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">% Total</TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">% Acum.</TableHead>
                <TableHead className="text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">Clasificación</TableHead>
                <TableHead className="text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">Salud</TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">Saldo vencido</TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">Recencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-6">Cargando…</TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">Sin clientes para mostrar</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.slice(0, 100).map((r, i) => (
                  <TableRow key={r.cliente} className="hover:bg-muted/20">
                    <TableCell className="px-3 py-2 text-muted-foreground tabular-nums text-xs font-medium">{i + 1}</TableCell>
                    <TableCell className="px-3 py-2 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {r.sucursalesCount > 1 ? (
                        <StatusPill kind="neutral">{r.sucursalesCount}</StatusPill>
                      ) : (
                        <span className="text-muted-foreground/50">1</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums font-medium">{money(r.montoPareto)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{pct(r.share, 1)}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums font-medium">{pct(r.acumulado, 1)}</TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <StatusPill kind={CLASIFICACION_KIND[r.clasificacion]}>{r.clasificacion}</StatusPill>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <StatusPill kind={BAND_KIND[r.band]}>{BAND_LABEL[r.band]} · {r.health.toFixed(0)}</StatusPill>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{r.saldoVencido > 0 ? money(r.saldoVencido) : "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.recenciaDias !== null ? `${r.recenciaDias}d` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filteredRows.length > 100 && (
          <div className="p-2 text-center text-xs text-muted-foreground border-t border-border">
            Mostrando 100 de {filteredRows.length} clientes — refina la búsqueda
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type MainTab = "clientes" | "pareto";

export default function ClientesPage() {
  const searchParams = useSearchParams();
  const clienteParam = searchParams.get("cliente");

  const { filters, setFilters } = useSharedFilters();
  const anio = filters.anio;
  const mes = filters.meses === "all" ? 0 : (filters.meses[0] ?? 0);
  const sucursalId = filters.sucursales[0] ?? undefined;
  const selectedUnidades = filters.unidades;

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const [mainTab, setMainTab] = useState<MainTab>("clientes");

  // sync ?cliente= param → default to clientes tab
  useEffect(() => {
    if (clienteParam) setMainTab("clientes");
  }, [clienteParam]);

  const sucursalOptions = useMemo(
    () => (sucursales ?? []).map((s) => ({ value: s.id, label: s.nombre })),
    [sucursales],
  );

  const unitOptions = useMemo(() => {
    if (!unidades) return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades]);

  const handleApplyFilters = (fs: FilterState) => {
    setFilters({
      anio: fs.anio,
      meses: fs.meses,
      sucursales: fs.sucursales ?? (fs.sucursal ? [fs.sucursal] : []),
      unidades: fs.unidades ?? [],
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Users className="h-7 w-7" /> Clientes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visión 360° de clientes · Pareto 80/20 por asesores
        </p>
      </div>

      {/* Barra de filtros unificada — sticky, multi-mes, multi-unidad */}
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={sucursalOptions}
        sucursalMulti
        unitOptions={unitOptions}
        defaultAnio={anio}
        defaultMes={filters.meses}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      {/* Tab principal */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="clientes" className="flex-1 sm:flex-none">Clientes 360°</TabsTrigger>
          <TabsTrigger value="pareto" className="flex-1 sm:flex-none">Pareto 80/20</TabsTrigger>
        </TabsList>
      </Tabs>

      {mainTab === "clientes" ? (
        <Clientes360Tab
          anio={anio}
          mes={mes}
          sucursalId={sucursalId}
          selectedUnidades={selectedUnidades}
          initialSearch={clienteParam ?? ""}
        />
      ) : (
        <ParetoAsesoresTab anio={anio} mes={mes} />
      )}
    </div>
  );
}
