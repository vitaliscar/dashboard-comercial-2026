"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { StatusPill } from "@/components/status-pill";
import { money, pct, statusFromPct, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getDateRangesForMonths, getAllMonthsCap } from "@/lib/date-range";
import { getSucursalMetricsAction, getSucursalTrendAction } from "@/lib/actions/sucursal";
import { useMemo } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { TrendingUp, Target, Zap, Calendar } from "lucide-react";

export default function SucursalPage() {
  const { role, profile } = useAuth();
  const hideSucursalFilter = role === "coordinador" || role === "asesor";
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;
  const selectedSucursales = hideSucursalFilter
    ? profile?.sucursal_id
      ? [profile.sucursal_id]
      : []
    : filters.sucursales;

  // Fetch reference data
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  // Build date ranges
  const dateRanges = useMemo(() => {
    return getDateRangesForMonths(anio, meses);
  }, [anio, meses]);

  const queryFilters = { anio, meses, selectedSucursales, selectedUnidades };
  const filterKey = JSON.stringify(queryFilters);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursales ?? [],
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  // Fetch main metrics - coordinator sees data for their sucursal + their asesores
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["sucursal-coordinator", filterKey],
    queryFn: () =>
      getSucursalMetricsAction({
        anio,
        meses,
        ranges: dateRanges,
        sucursales: selectedSucursales,
        unidades: selectedUnidades,
      }),
  });

  // Fetch monthly trend
  const { data: trend } = useQuery({
    queryKey: ["sucursal-trend", anio, selectedSucursales, selectedUnidades, JSON.stringify(meses)],
    queryFn: async () => {
      const { facturas: fData, presupuestos: pData } = await getSucursalTrendAction({
        anio,
        meses,
        sucursales: selectedSucursales,
        unidades: selectedUnidades,
      });

      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i].slice(0, 3),
        ventas: 0,
        presupuesto: 0,
      }));

      fData.forEach((r) => {
        const m = new Date(r.fecha).getMonth();
        byMonth[m].ventas += Number(r.monto);
      });

      pData.forEach((r) => {
        byMonth[r.mes - 1].presupuesto += Number(r.monto ?? 0);
      });

      if (meses !== "all") {
        const allowedShortNames = meses.map((m) => MESES[m - 1].slice(0, 3));
        return byMonth.filter((item) => allowedShortNames.includes(item.mes));
      } else {
        const cap = getAllMonthsCap(anio);
        return byMonth.slice(0, cap);
      }
    },
  });

  // Compute KPI totals
  const kpis = useMemo(() => {
    const totalFacturado =
      metrics?.facturacion.reduce((a, r) => a + Number(r.monto ?? 0), 0) ?? 0;
    const totalPresupuesto =
      metrics?.presupuestos.reduce((a, r) => a + Number(r.monto ?? 0), 0) ?? 0;
    const totalPerdido = metrics?.perdidas.reduce((a, r) => a + Number(r.monto ?? 0), 0) ?? 0;
    const cumplimiento = totalPresupuesto > 0 ? (totalFacturado / totalPresupuesto) * 100 : 0;

    return {
      cumplimiento,
      variacion: 0,
      totalFacturado,
      totalPresupuesto,
      totalPerdido,
      diasAdelanto: 0,
    };
  }, [metrics]);

  // Resumen card data
  const resumenData = useMemo(() => {
    return {
      totalFacturado: kpis.totalFacturado,
      facturacionCount: metrics?.facturacion.length ?? 0,
      totalPerdido: kpis.totalPerdido,
      perdidasCount: metrics?.perdidas.length ?? 0,
      cumplimiento: kpis.cumplimiento,
    };
  }, [kpis, metrics]);

  const cumplimientoStatus = statusFromPct(kpis.cumplimiento);

  // Filter sucursales - only show coordinator's sucursal
  const coordinatorSucursales = sucursales?.filter((s) => {
    if (role === "coordinador" && profile?.sucursal_id) {
      return s.id === profile.sucursal_id;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-400">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard comercial</h1>
      </div>

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={
          hideSucursalFilter
            ? undefined
            : coordinatorSucursales
                ?.filter((s) => s.nombre !== "Machine Shop")
                .map((s) => ({ value: s.id, label: s.nombre }))
        }
        sucursalMulti={false}
        unitOptions={(() => {
          if (!unidades) return undefined;
          type Chip = { value: string; label: string; order: number };
          const chips: Chip[] = [];
          for (const u of unidades) {
            const n = u.nombre.toLowerCase();
            const hasEquipo = n.includes("equipo");
            const hasAlquiler = n.includes("alquiler");
            const hasRepuesto = n.includes("repuesto");
            const hasLub = n.includes("lubri") || n.includes("filtro");
            const hasServicio = n.includes("servicio");
            if (hasEquipo && hasAlquiler) {
              chips.push({ value: u.id, label: "Equipos", order: 4 });
              chips.push({ value: u.id, label: "Alquiler", order: 5 });
            } else if (hasEquipo) chips.push({ value: u.id, label: "Equipos", order: 4 });
            else if (hasAlquiler) chips.push({ value: u.id, label: "Alquiler", order: 5 });
            else if (hasRepuesto) chips.push({ value: u.id, label: "Repuestos", order: 1 });
            else if (hasLub) chips.push({ value: u.id, label: "Lub / Filtros", order: 2 });
            else if (hasServicio) chips.push({ value: u.id, label: "Servicios", order: 3 });
            else chips.push({ value: u.id, label: u.nombre, order: 99 });
          }
          return chips
            .sort((a, b) => a.order - b.order)
            .map(({ value, label }) => ({ value, label }));
        })()}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Cumplimiento"
          value={pct(kpis.cumplimiento, 1)}
          hint={`Presupuesto: ${money(kpis.totalPresupuesto)}`}
          accent={
            cumplimientoStatus === "success"
              ? "success"
              : cumplimientoStatus === "warning"
                ? "warning"
                : "danger"
          }
          icon={Target}
        />
        <KpiCard
          label="Variación"
          value={`${kpis.variacion > 0 ? "+" : ""}${kpis.variacion.toFixed(1)}%`}
          hint={`vs Meta Inicial`}
          accent={kpis.variacion >= 0 ? "success" : "danger"}
          icon={TrendingUp}
        />
        <KpiCard
          label="Días Adelanto"
          value={String(kpis.diasAdelanto)}
          hint={`Vs. Cronograma`}
          accent="primary"
          icon={Calendar}
        />
        <KpiCard
          label="Totales Facturados"
          value={money(kpis.totalFacturado)}
          hint={`${(metrics?.facturacion ?? []).length} operaciones`}
          accent="success"
          icon={Zap}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales vs Budget Line Chart */}
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Ventas Mensuales {anio}</h3>
              <p className="text-xs text-muted-foreground">Línea presupuesto vs. ventas reales</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend ?? []}>
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="presupuesto"
                  fill="var(--color-muted-foreground)"
                  name="Presupuesto"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  name="Ventas"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resumen Card */}
        <div className="card-elevated p-5 flex flex-col gap-4">
          <h3 className="font-display font-semibold">Resumen</h3>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm font-medium">Total facturado</span>
              <span className="text-lg font-bold text-primary">
                {money(resumenData.totalFacturado)}
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm font-medium">Operaciones</span>
              <span className="text-lg font-bold">{resumenData.facturacionCount}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm font-medium">Ventas perdidas</span>
              <span className="text-lg font-bold text-danger">
                {money(resumenData.totalPerdido)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Cumplimiento</span>
              <div className="flex items-center gap-2">
                <StatusPill kind={cumplimientoStatus}>
                  {cumplimientoStatus === "success"
                    ? "Éxito"
                    : cumplimientoStatus === "warning"
                      ? "Alerta"
                      : "Crítico"}
                </StatusPill>
                <span className="text-lg font-bold">{pct(resumenData.cumplimiento, 1)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
