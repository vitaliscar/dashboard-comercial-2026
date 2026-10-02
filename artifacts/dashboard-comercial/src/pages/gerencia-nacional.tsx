"use client";

import { useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getResumen } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { canAccessModule } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { money, pct } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { BranchRanking } from "@/components/gerencia-nacional/BranchRanking";
import { UnitMetaVsVenta } from "@/components/gerencia-nacional/UnitMetaVsVenta";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import type { BranchSummaryRow } from "@/components/gerencia-nacional/BranchSummaryTable";
import {
  UnitComplianceHeatmap,
  type BranchUnitMetric,
} from "@/components/gerencia-nacional/UnitComplianceHeatmap";
import { getAllowedMonths } from "@/lib/date-range";
import { Shield } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";

type Acc = { meta: number; facturado: number };
const emptyAcc = (): Acc => ({ meta: 0, facturado: 0 });
const pctOf = (a: Acc) => (a.meta > 0 ? (a.facturado / a.meta) * 100 : 0);

type PresupuestoRow = {
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  monto: string | number | null;
  ventasCcv: string | number | null;
  ventasXibi: string | number | null;
  ventasEstrategicas: string | number | null;
};

export default function GerenciaNacionalPage() {
  const { role } = useAuth();
  const canView = canAccessModule(role, "gerencia_nacional");
  const [, setLocation] = useLocation();

  const { filters, setFilters } = useSharedFilters();
  const {
    anio,
    meses,
    sucursales: selectedSucursales = [],
    unidades: selectedUnidades = [],
  } = filters;

  const { data: sucursalesData } = useSucursales();
  const { data: unidades } = useUnidades();

  const handleApplyFilters = useCallback(
    (f: FilterState) => {
      setFilters({
        anio: f.anio,
        meses: f.meses,
        sucursales: f.sucursales ?? [],
        unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
      });
    },
    [setFilters],
  );

  // Un solo fetch por año (meses=all trae todo lo disponible hasta el mes
  // actual) — el filtrado por mes/sucursal/unidad ocurre en memoria abajo,
  // así que cambiar esos filtros no dispara un nuevo round-trip.
  const { data: resumen, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["gerencia-nacional-resumen", anio],
    enabled: canView,
    queryFn: () => getResumen({ anio, meses: "all" }),
  });

  const presupuestos = useMemo<PresupuestoRow[]>(
    () => (resumen?.presupuestos as PresupuestoRow[] | undefined) ?? [],
    [resumen],
  );

  const allowedMonths = useMemo(() => getAllowedMonths(anio, meses), [anio, meses]);

  const metrics = useMemo(() => {
    const rows = presupuestos.filter(
      (r) =>
        allowedMonths.includes(r.mes) &&
        (selectedSucursales.length === 0 ||
          (r.sucursalId && selectedSucursales.includes(r.sucursalId))) &&
        (selectedUnidades.length === 0 ||
          (r.unidadNegocioId && selectedUnidades.includes(r.unidadNegocioId))),
    );
    return { presupuestos: rows };
  }, [presupuestos, allowedMonths, selectedSucursales, selectedUnidades]);

  const crossRaw = useMemo(() => {
    const rows = presupuestos.filter(
      (r) =>
        allowedMonths.includes(r.mes) &&
        (selectedSucursales.length === 0 ||
          (r.sucursalId && selectedSucursales.includes(r.sucursalId))),
    );
    return { presupuestos: rows };
  }, [presupuestos, allowedMonths, selectedSucursales]);

  const cross = useMemo(() => {
    if (!sucursalesData || !unidades) return null;

    const branchAcc = new Map<string, Acc>();
    const unitAcc = new Map<string, Acc>();
    const branchUnitAcc = new Map<string, Map<string, Acc>>();

    const bump = (map: Map<string, Acc>, key: string, field: keyof Acc, value: number) => {
      const entry = map.get(key) ?? emptyAcc();
      entry[field] += value;
      map.set(key, entry);
    };

    crossRaw.presupuestos.forEach((r) => {
      if (!r.sucursalId || !r.unidadNegocioId) return;
      const meta = Number(r.monto ?? 0);
      const facturado =
        Number(r.ventasCcv ?? 0) + Number(r.ventasXibi ?? 0) + Number(r.ventasEstrategicas ?? 0);
      bump(unitAcc, r.unidadNegocioId, "meta", meta);
      bump(unitAcc, r.unidadNegocioId, "facturado", facturado);
      const branchUnits = branchUnitAcc.get(r.sucursalId) ?? new Map<string, Acc>();
      const branchUnit = branchUnits.get(r.unidadNegocioId) ?? emptyAcc();
      branchUnit.meta += meta;
      branchUnit.facturado += facturado;
      branchUnits.set(r.unidadNegocioId, branchUnit);
      branchUnitAcc.set(r.sucursalId, branchUnits);
      if (selectedUnidades.length === 0 || selectedUnidades.includes(r.unidadNegocioId)) {
        bump(branchAcc, r.sucursalId, "meta", meta);
        bump(branchAcc, r.sucursalId, "facturado", facturado);
      }
    });

    const branchRows: BranchSummaryRow[] = sucursalesData
      .map((s) => {
        const a = branchAcc.get(s.id) ?? emptyAcc();
        return { id: s.id, label: s.nombre, meta: a.meta, facturado: a.facturado, pct: pctOf(a) };
      })
      .filter((r) => r.meta > 0 || r.facturado > 0)
      .sort((a, b) => a.pct - b.pct);

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

    const branchUnitRows: BranchUnitMetric[] = Array.from(branchUnitAcc.entries()).flatMap(
      ([sucursalId, unitsByBranch]) =>
        Array.from(unitsByBranch.entries()).map(([unidadNegocioId, values]) => ({
          sucursalId,
          unidadNegocioId,
          ...values,
        })),
    );

    return { branchRows, unitRows, branchUnitRows };
  }, [crossRaw, sucursalesData, unidades, selectedUnidades]);

  const kpis = useMemo(() => {
    const totalFacturado = metrics.presupuestos.reduce(
      (a, r) => a + Number(r.ventasCcv ?? 0) + Number(r.ventasXibi ?? 0) + Number(r.ventasEstrategicas ?? 0),
      0,
    );
    const totalPresupuesto = metrics.presupuestos.reduce((a, r) => a + Number(r.monto ?? 0), 0);
    const cumplimiento = totalPresupuesto > 0 ? (totalFacturado / totalPresupuesto) * 100 : 0;
    return { cumplimiento, totalFacturado, totalPresupuesto };
  }, [metrics]);

  const unitChartData = cross?.unitRows ?? [];
  const unitDonutData = cross?.unitRows.map((unit) => ({
    id: unit.id,
    label: unit.label,
    facturado: unit.facturado,
  })) ?? [];

  const openSucursalResumen = useCallback(
    (sucursalId: string, unidadNegocioId?: string) => {
      setFilters({
        sucursales: [sucursalId],
        unidades: unidadNegocioId ? [unidadNegocioId] : selectedUnidades,
      });
      setLocation("/resumen");
    },
    [selectedUnidades, setFilters, setLocation],
  );

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Esta vista está disponible para Administrador y Gerencia Nacional.
        </p>
      </div>
    );
  }

  if (isLoading && !resumen) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Gerencia nacional" title="Dashboard comercial" />
        <PageSkeleton
          kpis={0}
          blocks={[{ cols: 3, height: 260 }, { cols: 2 }, { cols: 1, height: 420 }]}
        />
      </div>
    );
  }

  if (isError && !resumen) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Gerencia nacional" title="Dashboard comercial" />
        <div className="card-elevated flex max-w-2xl flex-col items-start gap-3 p-6" role="alert">
          <h2 className="font-display text-lg font-semibold">No se cargaron los datos</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "No se pudo consultar el resumen comercial."}
          </p>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={() => void refetch()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ccv-national-dashboard flex flex-col gap-6">
      <PageHeader
        eyebrow="Gerencia nacional"
        title="Dashboard comercial"
        description="Cumplimiento por sucursal y unidad. Selecciona una celda o sucursal para abrir su detalle filtrado."
      />
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

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 section-enter section-enter-1"
        aria-label="Resultado comercial del período"
      >
        <div className="card-elevated p-4 sm:p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Facturado</div>
          <div className="mt-2 font-display text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{money(kpis.totalFacturado)}</div>
        </div>
        <div className="card-elevated p-4 sm:p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Meta</div>
          <div className="mt-2 font-display text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{money(kpis.totalPresupuesto)}</div>
        </div>
        <div className="card-elevated p-4 sm:p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cumplimiento</div>
          <div className="mt-2 font-display text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{pct(kpis.cumplimiento, 1)}</div>
        </div>
        <div className="card-elevated p-4 sm:p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {kpis.totalPresupuesto <= 0
              ? "Meta no asignada"
              : kpis.totalFacturado >= kpis.totalPresupuesto
                ? "Sobre meta"
                : "Falta para meta"}
          </div>
          <div className="mt-2 font-display text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
            {kpis.totalPresupuesto <= 0
              ? "—"
              : money(Math.abs(kpis.totalPresupuesto - kpis.totalFacturado))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]" aria-label="Gráficos generales del período">
        <UnitMetaVsVenta data={unitChartData} selectedIds={selectedUnidades} />
        <UnitDonut data={unitDonutData} selectedIds={selectedUnidades} title="Distribución de facturación" />
      </section>

      <UnitComplianceHeatmap
        branches={cross?.branchRows ?? []}
        units={cross?.unitRows ?? []}
        values={cross?.branchUnitRows ?? []}
        selectedUnitIds={selectedUnidades}
        onSelectCell={(sucursalId, unidadNegocioId) => openSucursalResumen(sucursalId, unidadNegocioId)}
        onSelectBranch={(sucursalId) => openSucursalResumen(sucursalId)}
      />

      <div className="section-enter section-enter-2">
        <BranchRanking
          rows={cross?.branchRows ?? []}
          onSelect={(sucursalId) => openSucursalResumen(sucursalId)}
        />
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
