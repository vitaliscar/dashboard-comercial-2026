"use client";

import { useSearchParams } from "@/hooks/use-next-compat";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { getCliente360DataAction, type Cliente360Fuente } from "@/lib/actions/cliente-360";
import { money, diasEntre } from "@/lib/format";
import { canAccessModule } from "@/lib/permissions";
import { computeHealthScore, healthBand, type HealthBand } from "@/lib/analytics/health-score";
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
  CHART_X_AXIS_VALUE_HIDDEN,
  CHART_Y_AXIS_HIDDEN,
  type ChartConfig,
} from "@/components/ui/chart";
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
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/page-skeleton";

// ─── constantes ───────────────────────────────────────────────────────────────

const MESES_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const FUENTE_CLIENTE_TITULO: Record<Cliente360Fuente, string> = {
  cotizado: "Cotizado",
  facturado: "Facturado",
  perdido: "Ventas Perdidas",
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

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

  /**
   * Filas de ajuste contable/manual no representan clientes reales y no deben
   * aparecer en el detalle ni contaminar las métricas.
   */
function esClienteAjusteManual(nombre: string | null | undefined): boolean {
  const n = normalize(nombre);
  return n.includes("ajuste") && n.includes("manual");
}

// ─── Shared filter bar ───────────────────────────────────────────────────────

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

  const { rows } = useMemo(() => {
    if (!data) {
      return { rows: [] };
    }

    const porCliente = new Map<
      string,
      {
        nombre: string;
        monto: number;
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
      if (!key || esClienteAjusteManual(nombre)) return null;
      let e = porCliente.get(key);
      if (!e) {
        e = {
          nombre,
          monto: 0,
          sucursales: new Set<string>(),
          ltv: 0,
          ultimaFecha: null,
          saldoVencido: 0,
          diasVencidoMax: 0,
          montoPerdidoReciente: 0,
        };
        porCliente.set(key, e);
      }
      return e;
    };

    data.sourceRows.forEach((p) => {
      const e = upsert(p.cliente);
      if (!e) return;
      e.monto += Number(p.monto) || 0;
      if (p.sucursal_id) e.sucursales.add(p.sucursal_id);
    });

    data.facturas.forEach((f) => {
      const e = upsert(f.cliente);
      if (!e) return;
      e.ltv += Number(f.monto) || 0;
      const fecha = new Date(f.fecha);
      if (!isNaN(fecha.getTime()) && (!e.ultimaFecha || fecha > e.ultimaFecha))
        e.ultimaFecha = fecha;
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

    const unifiedRows = Array.from(porCliente.values())
      .map((entry) => {
        const ltv = Math.round(entry.ltv * 100) / 100;
        const saldoVencido = Math.round(entry.saldoVencido * 100) / 100;
        const diasVencidoMax = Math.max(0, entry.diasVencidoMax);
        const recenciaDias = entry.ultimaFecha ? diasEntre(entry.ultimaFecha, hoy) : null;
        const montoPerdidoReciente = Math.round(entry.montoPerdidoReciente * 100) / 100;

        const health = computeHealthScore({
          diasVencidoMax,
          saldoVencido,
          recenciaDias: recenciaDias ?? 365,
          montoPerdidoReciente,
          ltv,
        });
        const band = healthBand(health);

        return {
          cliente: entry.nombre,
          sucursalesCount: entry.sucursales.size,
          monto: entry.monto,
          health,
          band,
          saldoVencido,
          diasVencidoMax,
          recenciaDias,
          ltv,
        };
      })
      .sort((a, b) => b.monto - a.monto);

    return {
      rows: unifiedRows,
    };
  }, [data, hoy]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = normalize(search);
    return rows.filter((r) => normalize(r.cliente).includes(q));
  }, [rows, search]);

  const kpis = useMemo(() => {
    const enRiesgo = rows.filter((r) => r.band === "riesgo").length;
    const saldoTotalVencido = rows.reduce((a, r) => a + r.saldoVencido, 0);
    const ltvTotal = rows.reduce((a, r) => a + r.ltv, 0);
    return {
      total: rows.length,
      enRiesgo,
      saldoTotalVencido,
      ltvTotal,
    };
  }, [rows]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2 mx-auto mt-4">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <PageSkeleton
        kpis={4}
        blocks={[
          { cols: 1, height: 400 },
          { cols: 1, height: 320 },
        ]}
      />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Clientes" value={String(kpis.total)} accent="primary" icon={Users} />
        <KpiCard
          label="En riesgo"
          value={String(kpis.enRiesgo)}
          accent={kpis.enRiesgo > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Saldo vencido total"
          value={money(kpis.saldoTotalVencido)}
          accent="warning"
        />
        <KpiCard label="LTV histórico total" value={money(kpis.ltvTotal)} accent="success" />
      </div>

      {/* TABLA */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Detalle por Cliente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salud del cliente y morosidad ({FUENTE_CLIENTE_TITULO[fuente]})
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
            {/* sticky en cada <th>, no en el <thead>: Safari no soporta position:sticky
                sobre thead, solo sobre th/tr — así la cabecera queda fija en todos los navegadores. */}
            <TableHeader className="[&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-left px-3 py-2 text-xs tracking-wider w-12">
                  #
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-left px-3 py-2 text-xs tracking-wider">
                  Cliente
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">
                  Suc.
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Monto ({FUENTE_CLIENTE_TITULO[fuente]})
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">
                  Salud
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Saldo vencido
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-primary text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Recencia
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users />
                        </EmptyMedia>
                        <EmptyTitle>Sin clientes para mostrar</EmptyTitle>
                        <EmptyDescription>
                          Ningún cliente coincide con la búsqueda o los filtros de sucursal/unidad
                          actuales.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.slice(0, 100).map((r, i) => (
                  <TableRow key={r.cliente} className="hover:bg-muted/20">
                    <TableCell className="px-3 py-2 text-muted-foreground tabular-nums text-xs font-medium">
                      {i + 1}
                    </TableCell>
                    <TableCell className="px-3 py-2 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {r.sucursalesCount > 1 ? (
                        <StatusPill kind="neutral">{r.sucursalesCount}</StatusPill>
                      ) : (
                        <span className="text-muted-foreground/50">1</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums font-medium">
                      {money(r.monto)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <StatusPill kind={BAND_KIND[r.band]}>
                        {BAND_LABEL[r.band]} · {r.health.toFixed(0)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {r.saldoVencido > 0 ? money(r.saldoVencido) : "—"}
                    </TableCell>
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
        <p className="text-muted-foreground text-sm mt-1">Visión 360° de clientes</p>
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

      <Clientes360Tab
        anio={anio}
        mes={mes}
        sucursalId={sucursalId}
        selectedUnidades={selectedUnidades}
        initialSearch={clienteParam ?? ""}
      />
    </div>
  );
}
