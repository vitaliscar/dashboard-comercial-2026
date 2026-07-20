import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { money, pct, statusFromPct } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { UnitMetaVsVenta, type UnitChartRow } from "@/components/gerencia-nacional/UnitMetaVsVenta";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { BranchRanking } from "@/components/gerencia-nacional/BranchRanking";
import {
  BranchSummaryTable,
  type BranchSummaryRow,
} from "@/components/gerencia-nacional/BranchSummaryTable";
import {
  UnitHeatmapMatrix,
  type MatrixRow,
  type MatrixUnit,
} from "@/components/gerencia-nacional/UnitHeatmapMatrix";
import { getAllowedMonths } from "@/lib/date-range";
import { useMemo } from "react";
import { Trophy, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_app/gerencia-nacional")({
  head: () => ({ meta: [{ title: "Gerencia Nacional · CCV" }] }),
  component: GerenciaNacional,
});

type Acc = { meta: number; facturado: number };
const emptyAcc = (): Acc => ({ meta: 0, facturado: 0 });
const pctOf = (a: Acc) => (a.meta > 0 ? (a.facturado / a.meta) * 100 : 0);

function GerenciaNacional() {
  const { role } = useAuth();
  const canView = role === "gerencia" || role === "gerente_comercial";

  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, sucursales: selectedSucursales, unidades: selectedUnidades } = filters;

  // Fetch reference data
  const { data: sucursalesData } = useSucursales();
  const { data: unidades } = useUnidades();

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursales ?? [],
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  // Un solo fetch por año vía rpc_resumen_mensual (ya scopeado server-side por
  // can_read_row, agregado por Postgres desde presupuestos). Se cachea por
  // `anio` solamente — el filtrado por mes/sucursal/unidad ocurre en memoria
  // abajo, así que cambiar esos filtros no dispara un nuevo round-trip.
  const { data: resumenAnual, isLoading } = useQuery({
    queryKey: ["gerencia-nacional-resumen", anio],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_resumen_mensual", { _anio: anio });
      if (error) throw error;
      return data ?? [];
    },
  });

  const allowedMonths = useMemo(() => getAllowedMonths(anio, meses), [anio, meses]);

  // Overall totals for the compliance gauge — respects every filter, including the unit chips.
  const metrics = useMemo(() => {
    if (!resumenAnual) return null;
    const rows = resumenAnual.filter(
      (r) =>
        allowedMonths.includes(r.mes) &&
        (selectedSucursales.length === 0 ||
          (r.sucursal_id && selectedSucursales.includes(r.sucursal_id))) &&
        (selectedUnidades.length === 0 ||
          (r.unidad_negocio_id && selectedUnidades.includes(r.unidad_negocio_id))),
    );
    return { presupuestos: rows };
  }, [resumenAnual, allowedMonths, selectedSucursales, selectedUnidades]);

  // Sucursal x unidad breakdown — always the full picture, independent of the unit chip filter.
  const crossRaw = useMemo(() => {
    if (!resumenAnual) return null;
    const rows = resumenAnual.filter(
      (r) =>
        allowedMonths.includes(r.mes) &&
        (selectedSucursales.length === 0 ||
          (r.sucursal_id && selectedSucursales.includes(r.sucursal_id))),
    );
    return { presupuestos: rows };
  }, [resumenAnual, allowedMonths, selectedSucursales]);

  // Aggregate the cross data into branch rows, unit rows and the sucursal x unidad matrix.
  const cross = useMemo(() => {
    if (!crossRaw || !sucursalesData || !unidades) return null;

    const branchAcc = new Map<string, Acc>();
    const unitAcc = new Map<string, Acc>();
    const matrixAcc = new Map<string, Map<string, Acc>>();

    const bump = (map: Map<string, Acc>, key: string, field: keyof Acc, value: number) => {
      const entry = map.get(key) ?? emptyAcc();
      entry[field] += value;
      map.set(key, entry);
    };

    crossRaw.presupuestos.forEach((r) => {
      if (!r.sucursal_id || !r.unidad_negocio_id) return;
      const meta = Number(r.meta ?? 0);
      const facturado = Number(r.facturado ?? 0);
      // unitAcc always sees every row: the donut/meta-vs-venta chart must keep showing
      // every unit (dimmed via selectedIds), never drop one from the visualization.
      bump(unitAcc, r.unidad_negocio_id, "meta", meta);
      bump(unitAcc, r.unidad_negocio_id, "facturado", facturado);
      // branchAcc feeds"Resumen por sucursal"/"Cumplimiento por sucursal", which the
      // unit chips should actually scope — skip rows outside the current unit selection.
      if (selectedUnidades.length === 0 || selectedUnidades.includes(r.unidad_negocio_id)) {
        bump(branchAcc, r.sucursal_id, "meta", meta);
        bump(branchAcc, r.sucursal_id, "facturado", facturado);
      }
      if (!matrixAcc.has(r.sucursal_id)) matrixAcc.set(r.sucursal_id, new Map());
      const cell = matrixAcc.get(r.sucursal_id)!;
      bump(cell, r.unidad_negocio_id, "meta", meta);
      bump(cell, r.unidad_negocio_id, "facturado", facturado);
    });

    const branchRows: BranchSummaryRow[] = sucursalesData
      .map((s) => {
        const a = branchAcc.get(s.id) ?? emptyAcc();
        return { id: s.id, label: s.nombre, meta: a.meta, facturado: a.facturado, pct: pctOf(a) };
      })
      .filter((r) => r.meta > 0 || r.facturado > 0)
      .sort((a, b) => b.pct - a.pct);

    const unitRows = unidades
      .map((u) => {
        const a = unitAcc.get(u.id) ?? emptyAcc();
        const info = unidadLabelInfo(u.nombre);
        return {
          id: u.id,
          label: info.label,
          order: info.order,
          meta: a.meta,
          facturado: a.facturado,
          pct: pctOf(a),
        };
      })
      .filter((r) => r.meta > 0 || r.facturado > 0)
      .sort((a, b) => a.order - b.order);

    const matrixUnits: MatrixUnit[] = unitRows.map((u) => ({ id: u.id, label: u.label }));

    const matrixRows: MatrixRow[] = branchRows.map((b) => {
      const cellsMap = matrixAcc.get(b.id);
      const cells: MatrixRow["cells"] = {};
      unitRows.forEach((u) => {
        const a = cellsMap?.get(u.id);
        cells[u.id] = a ? { meta: a.meta, facturado: a.facturado, pct: pctOf(a) } : undefined;
      });
      return {
        sucursalId: b.id,
        sucursal: b.label,
        cells,
        general: { meta: b.meta, facturado: b.facturado, pct: b.pct },
      };
    });

    return { branchRows, unitRows, matrixUnits, matrixRows };
  }, [crossRaw, sucursalesData, unidades, selectedUnidades]);

  // Highlight KPIs: best branch, branches under 70%, weakest/strongest unit — always full-picture.
  const highlights = useMemo(() => {
    if (!cross) return null;
    const mejorSucursal = cross.branchRows[0] ?? null;
    const bajo70 = cross.branchRows.filter((r) => r.pct < 70);
    const unidadesPorPct = [...cross.unitRows].sort((a, b) => a.pct - b.pct);
    return {
      mejorSucursal,
      bajo70Count: bajo70.length,
      bajo70Total: cross.branchRows.length,
      bajo70Faltante: bajo70.reduce((acc, r) => acc + Math.max(0, r.meta - r.facturado), 0),
      unidadMasBaja: unidadesPorPct[0] ?? null,
      unidadMasAlta: unidadesPorPct[unidadesPorPct.length - 1] ?? null,
    };
  }, [cross]);

  const unitChartData: UnitChartRow[] = cross?.unitRows ?? [];
  const unitDonutData =
    cross?.unitRows.map((u) => ({ id: u.id, label: u.label, facturado: u.facturado })) ?? [];

  // Compute overall totals for the gauge (respects the unit chip filter).
  const kpis = useMemo(() => {
    const totalFacturado =
      metrics?.presupuestos.reduce((a, r) => a + Number(r.facturado ?? 0), 0) ?? 0;
    const totalPresupuesto =
      metrics?.presupuestos.reduce((a, r) => a + Number(r.meta ?? 0), 0) ?? 0;
    const cumplimiento = totalPresupuesto > 0 ? (totalFacturado / totalPresupuesto) * 100 : 0;
    return { cumplimiento, totalFacturado, totalPresupuesto };
  }, [metrics]);

  // Gauge title reflects the selected business-unit chip, falling back to the general label.
  const gaugeTitle = useMemo(() => {
    if (selectedUnidades.length === 0) return "Cumplimiento General";
    if (selectedUnidades.length === 1) {
      const selected = unidades?.find((u) => u.id === selectedUnidades[0]);
      return selected ? unidadLabelInfo(selected.nombre).label : "Cumplimiento General";
    }
    return "Cumplimiento unidades seleccionadas (consolidado)";
  }, [selectedUnidades, unidades]);

  // With 2+ units selected (e.g. a multi-unidad Gerente Comercial like Nestor Piña with
  // Equipos+Alquiler), show each unit's own cumplimiento separately alongside the consolidated
  // gauge above — never blended into a single number the user can't decompose.
  const selectedUnitBreakdown = useMemo(() => {
    if (!cross || selectedUnidades.length < 2) return null;
    return cross.unitRows.filter((u) => selectedUnidades.includes(u.id));
  }, [cross, selectedUnidades]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Sólo los perfiles Gerencia Nacional y Gerente Comercial pueden ver esta vista.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <PageHeader eyebrow="Analytics / National" title="Dashboard comercial" />
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={sucursalesData
          ?.filter((s) => s.nombre !== "Machine Shop")
          .map((s) => ({ value: s.id, label: s.nombre }))}
        sucursalMulti
        unitOptions={unidades?.map((u) => ({
          value: u.id,
          label: unidadLabelInfo(u.nombre).label,
        }))}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      {/* Hero: gauge general + highlights compactos + composición de venta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.75fr_1.25fr] section-enter section-enter-1">
        <ComplianceGauge
          pct={kpis.cumplimiento}
          facturado={kpis.totalFacturado}
          presupuesto={kpis.totalPresupuesto}
          title={gaugeTitle}
        />

        {/* Highlights: 4 KPIs rectangulares apilados - stretch to fill height */}
        <div className="flex flex-col gap-2 flex-1">
          {/* Mejor sucursal */}
          <div className="card-elevated px-4 py-3 flex items-center gap-3 flex-1">
            <Trophy className="size-4 text-success shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display font-bold tracking-wide text-muted-foreground">
                Mejor sucursal
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-bold text-xl tabular-nums text-success">
                  {highlights?.mejorSucursal ? pct(highlights.mejorSucursal.pct) : "—"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {highlights?.mejorSucursal
                    ? `${money(highlights.mejorSucursal.facturado)} · ${highlights.mejorSucursal.label}`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Bajo 70% */}
          <div className="card-elevated px-4 py-3 flex items-center gap-3 flex-1">
            <AlertTriangle
              className={`size-4 shrink-0 ${
                highlights && highlights.bajo70Count > 0 ? "text-danger" : "text-success"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display font-bold tracking-wide text-muted-foreground">
                Bajo 70%
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-display font-bold text-xl tabular-nums ${
                    highlights && highlights.bajo70Count > 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {highlights ? `${highlights.bajo70Count}/${highlights.bajo70Total}` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {highlights && highlights.bajo70Count > 0
                    ? `${money(highlights.bajo70Faltante)} faltante`
                    : "Todas OK"}
                </span>
              </div>
            </div>
          </div>

          {/* Unidad más baja */}
          <div className="card-elevated px-4 py-3 flex items-center gap-3 flex-1">
            <TrendingDown className="size-4 text-danger shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display font-bold tracking-wide text-muted-foreground">
                Unidad más baja
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-bold text-xl tabular-nums text-danger">
                  {highlights?.unidadMasBaja ? pct(highlights.unidadMasBaja.pct) : "—"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {highlights?.unidadMasBaja
                    ? `${money(Math.max(0, highlights.unidadMasBaja.meta - highlights.unidadMasBaja.facturado))} faltó · ${highlights.unidadMasBaja.label}`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Unidad más alta */}
          <div className="card-elevated px-4 py-3 flex items-center gap-3 flex-1">
            <TrendingUp
              className={`size-4 shrink-0 ${
                statusFromPct(highlights?.unidadMasAlta?.pct ?? 0) === "danger"
                  ? "text-warning"
                  : "text-success"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display font-bold tracking-wide text-muted-foreground">
                Unidad más alta
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-display font-bold text-xl tabular-nums ${
                    statusFromPct(highlights?.unidadMasAlta?.pct ?? 0) === "danger"
                      ? "text-warning"
                      : "text-success"
                  }`}
                >
                  {highlights?.unidadMasAlta ? pct(highlights.unidadMasAlta.pct) : "—"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {highlights?.unidadMasAlta
                    ? `${money(highlights.unidadMasAlta.facturado)} · ${highlights.unidadMasAlta.label}`
                    : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <UnitDonut data={unitDonutData} selectedIds={selectedUnidades} />
      </div>

      {/* Desglose separado por unidad — solo aparece con 2+ unidades seleccionadas.
          El gauge de arriba ya muestra el total consolidado; esto muestra cada unidad
          por separado (nunca mezcladas), p. ej. para un GC de Equipos + Alquiler. */}
      {selectedUnitBreakdown && selectedUnitBreakdown.length > 0 && (
        <div className="flex flex-col gap-3 section-enter section-enter-2">
          <div>
            <h3 className="font-display font-semibold text-sm">Desglose por unidad seleccionada</h3>
            <p className="text-xs text-muted-foreground">
              Cada unidad se muestra por separado — el consolidado está arriba
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedUnitBreakdown.map((u) => {
              const status = statusFromPct(u.pct);
              return (
                <KpiCard
                  key={u.id}
                  label={u.label}
                  value={pct(u.pct)}
                  hint={`${money(u.facturado)} de ${money(u.meta)}`}
                  accent={status}
                  progress={Math.min(100, u.pct)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Meta vs venta por unidad + Cumplimiento por sucursal (Ranking) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 section-enter section-enter-2">
        <UnitMetaVsVenta data={unitChartData} selectedIds={selectedUnidades} />
        <BranchRanking rows={cross?.branchRows ?? []} />
      </div>

      {/* Resumen por sucursal + Mapa de calor (Matriz). content-visibility:auto
          difiere el layout/paint hasta que la fila entra al viewport. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 section-enter section-enter-3 [content-visibility:auto] [contain-intrinsic-size:auto_420px]">
        <BranchSummaryTable rows={cross?.branchRows ?? []} />
        <UnitHeatmapMatrix rows={cross?.matrixRows ?? []} units={cross?.matrixUnits ?? []} />
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
