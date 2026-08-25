"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { getAsesorMetricsAction, getAsesorTrendAction } from "@/lib/actions/asesor";
import { KpiCard } from "@/components/kpi-card";
import { money, pct, statusFromPct, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getDateRangesForMonths, getAllMonthsCap } from "@/lib/date-range";
import { useMemo, useEffect } from "react";
import { useChartAnimation } from "@/hooks/use-chart-animation";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LabelList,
  Cell,
} from "recharts";
import { TrendingUp, Target, Zap, Shield, Ambulance, Truck, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function AsesorPage() {
  const chartAnimation = useChartAnimation();
  const { role, profile } = useAuth();
  const canView = role === "asesor";

  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const { data: unidades } = useUnidades();

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const queryFilters = { anio, meses, selectedUnidades };
  const filterKey = JSON.stringify(queryFilters);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      const today = new Date();
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (meses === "all") {
          setFilters({ ...filters, meses: [12] });
        } else {
          const currentMes = meses[0] ?? today.getMonth() + 1;
          if (currentMes > 1) {
            setFilters({ ...filters, meses: [currentMes - 1] });
          } else {
            setFilters({ ...filters, meses: [12], anio: anio - 1 });
          }
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (meses === "all") {
          setFilters({ ...filters, meses: [1] });
        } else {
          const currentMes = meses[0] ?? today.getMonth() + 1;
          if (currentMes < 12) {
            setFilters({ ...filters, meses: [currentMes + 1] });
          } else {
            setFilters({ ...filters, meses: [1], anio: anio + 1 });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filters, anio, meses, setFilters]);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["asesor-panel", filterKey, profile?.id],
    enabled: canView,
    queryFn: () =>
      getAsesorMetricsAction({ anio, meses, ranges: dateRanges, unidades: selectedUnidades }),
  });

  const { data: trend } = useQuery({
    queryKey: ["asesor-trend", anio, JSON.stringify(meses), selectedUnidades, profile?.id],
    enabled: canView,
    queryFn: async () => {
      const { facturas: fData, presupuestos: pData } = await getAsesorTrendAction({
        anio,
        meses,
        unidades: selectedUnidades,
      });

      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i].slice(0, 3),
        ventas: 0,
        presupuesto: 0,
      }));

      fData.forEach((r) => {
        if (r.mes >= 1 && r.mes <= 12) {
          byMonth[r.mes - 1].ventas += Number(r.monto);
        }
      });

      pData.forEach((r) => {
        if (r.mes >= 1 && r.mes <= 12) {
          byMonth[r.mes - 1].presupuesto += Number(r.presupuesto ?? 0);
        }
      });

      const monthCap = getAllMonthsCap(anio);
      return byMonth.slice(0, monthCap).map((item, i) => ({
        ...item,
        seleccionado: meses !== "all" && meses.includes(i + 1),
      }));
    },
  });

  const variacion = useMemo(() => {
    if (!trend || trend.length === 0) return 0;
    const monthIndexes =
      meses === "all" ? trend.map((_, i) => i + 1) : [...meses].sort((a, b) => a - b);
    if (monthIndexes.length === 0) return 0;
    const firstMonth = monthIndexes[0];
    const windowSize = monthIndexes.length;
    const currentSum = monthIndexes.reduce((acc, m) => acc + (trend[m - 1]?.ventas ?? 0), 0);
    const prevStart = firstMonth - windowSize;
    if (prevStart < 1) return 0;
    let prevSum = 0;
    for (let m = prevStart; m < firstMonth; m++) {
      prevSum += trend[m - 1]?.ventas ?? 0;
    }
    if (prevSum <= 0) return 0;
    return ((currentSum - prevSum) / prevSum) * 100;
  }, [trend, meses]);

  const kpis = useMemo(() => {
    const totalFacturado = metrics?.facturacion.totalMonto ?? 0;
    const totalPresupuesto =
      metrics?.presupuestos.reduce((a, r) => a + Number(r.presupuesto ?? 0), 0) ?? 0;
    const totalPerdido = metrics?.perdidas.totalMonto ?? 0;
    const cumplimiento = totalPresupuesto > 0 ? (totalFacturado / totalPresupuesto) * 100 : 0;

    return {
      cumplimiento,
      variacion,
      totalFacturado,
      totalPresupuesto,
      totalPerdido,
    };
  }, [metrics, variacion]);

  const cumplimientoStatus = statusFromPct(kpis.cumplimiento);

  const yDomainMax = useMemo(() => {
    const maxVal = Math.max(0, ...(trend ?? []).flatMap((t) => [t.ventas, t.presupuesto]));
    return maxVal + Math.max(30000, maxVal * 0.1);
  }, [trend]);

  const tier =
    kpis.cumplimiento >= 90
      ? { icon: Rocket, label: "Acelerando", accent: "text-success" }
      : kpis.cumplimiento >= 50
        ? { icon: Truck, label: "En camino", accent: "text-warning" }
        : { icon: Ambulance, label: "Crítico", accent: "text-danger" };

  const scorecard = useMemo(() => {
    const nVentas = metrics?.facturacion.cantidad ?? 0;
    const nCotizaciones = metrics?.cotizaciones.cantidad ?? 0;
    const minutasList = metrics?.minutas ?? [];
    const scoreAsesor = metrics?.scoreAsesor ?? metrics?.presupuestos ?? [];

    const conversion = nCotizaciones > 0 ? (nVentas / nCotizaciones) * 100 : 0;
    const ticketPromedio = nVentas > 0 ? kpis.totalFacturado / nVentas : 0;
    const ticketNorm = Math.min(100, (ticketPromedio / 5000) * 100);
    const totalMinutas = minutasList.reduce((acc, m) => acc + m.cantidad, 0);
    const minutasCumplidas = minutasList.reduce((acc, m) => {
      if (m.estado !== "cumplido") return acc;
      if (!m.fechaLimite) return acc + m.cantidad;
      if (new Date(m.fechaLimite).getTime() >= Date.now() - 86400000) return acc + m.cantidad;
      return acc;
    }, 0);
    const disciplina = totalMinutas > 0 ? (minutasCumplidas / totalMinutas) * 100 : 100;
    const participacion =
      scoreAsesor.length > 0
        ? scoreAsesor.reduce((a, r) => a + Number(r.pctParticipacion ?? 0), 0) / scoreAsesor.length
        : 0;

    return {
      ticketPromedio,
      radar: [
        { eje: "Cumplimiento", valor: Math.min(100, Math.max(0, kpis.cumplimiento)) },
        { eje: "Conversión", valor: Math.min(100, Math.max(0, conversion)) },
        { eje: "Ticket", valor: Math.min(100, Math.max(0, ticketNorm)) },
        { eje: "Disciplina", valor: Math.min(100, Math.max(0, disciplina)) },
        { eje: "Participación", valor: Math.min(100, Math.max(0, participacion)) },
      ],
    };
  }, [metrics, kpis.cumplimiento, kpis.totalFacturado]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Esta vista está disponible únicamente para el perfil Asesor.
        </p>
      </div>
    );
  }

  if (isLoading && !metrics) {
    return (
      <PageSkeleton
        kpis={4}
        blocks={[
          { cols: 3, height: 260 },
          { cols: 1, height: 320 },
        ]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Vista personal"
        title={`Bienvenido, ${profile?.nombre_completo?.split(" ")[0] ?? "Asesor"}`}
        description="Tu avance de cuota, cartera y agenda comercial en un solo lugar."
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
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

      <div
        role="region"
        aria-label="Atajos de teclado rápidos del panel"
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground/80 font-mono bg-card rounded-lg border border-border/40 select-none no-print"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="bg-foreground/5 text-foreground font-semibold px-1.5 py-0.5 rounded text-[10px] tracking-wider">
            SHORTCUTS
          </span>
          <span className="flex items-center gap-1.5" aria-keyshortcuts="ArrowLeft ArrowRight">
            Navegar Meses:{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              ←
            </kbd>{" "}
            /{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              →
            </kbd>
          </span>
        </div>
        <div className="hidden sm:inline-flex items-center gap-1.5" aria-keyshortcuts="Control+P">
          Imprimir / PDF:{" "}
          <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
            Ctrl + P
          </kbd>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          hint="vs. periodo anterior equivalente"
          accent={kpis.variacion >= 0 ? "success" : "danger"}
          icon={TrendingUp}
        />
        <KpiCard
          label="Totales Facturados"
          value={money(kpis.totalFacturado)}
          hint={`${metrics?.facturacion?.cantidad ?? 0} operaciones`}
          accent="success"
          icon={Zap}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 section-enter section-enter-1">
        <div className="card-elevated p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Ventas Mensuales {anio}</h3>
              <p className="text-xs text-muted-foreground">Línea presupuesto vs. ventas reales</p>
            </div>
          </div>
          <div className="flex-1 min-h-64">
            <ResponsiveContainer width="100%" height="100%" debounce={200}>
              <ComposedChart data={trend ?? []}>
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis domain={[0, yDomainMax]} hide />
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
                <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="presupuesto"
                  fill="var(--color-muted-foreground)"
                  name="Presupuesto"
                  radius={[4, 4, 0, 0]}
                  {...chartAnimation}
                >
                  {(trend ?? []).map((item, i) => (
                    <Cell
                      key={i}
                      fill={
                        item.seleccionado ? "var(--color-primary)" : "var(--color-muted-foreground)"
                      }
                      fillOpacity={item.seleccionado ? 0.9 : 0.5}
                    />
                  ))}
                  <LabelList
                    dataKey="presupuesto"
                    position="top"
                    fontSize={9}
                    fontWeight={700}
                    fill="var(--color-muted-foreground)"
                    formatter={((v: unknown) => money(Number(v))) as never}
                  />
                </Bar>
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  name="Ventas"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => {
                    const item = (trend ?? [])[props.index ?? -1];
                    const key = `dot-${props.index}`;
                    if (!item?.seleccionado) {
                      return <circle key={key} cx={props.cx} cy={props.cy} r={0} />;
                    }
                    return (
                      <circle
                        key={key}
                        cx={props.cx}
                        cy={props.cy}
                        r={5}
                        fill="var(--color-primary)"
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      />
                    );
                  }}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="ventas"
                    position="top"
                    fontSize={9}
                    fontWeight={700}
                    fill="var(--color-primary)"
                    formatter={((v: unknown) => money(Number(v))) as never}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5 flex flex-col gap-4">
          <h3 className="font-display font-semibold">Resumen</h3>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold mb-1">
                Total Ventas
              </p>
              <p className="font-display font-semibold text-lg tabular-nums text-primary">
                {money(kpis.totalFacturado)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold mb-1">
                Total Presupuestado
              </p>
              <p className="font-display font-semibold text-lg tabular-nums">
                {money(kpis.totalPresupuesto)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold mb-1">
                Ventas Pérdidas
              </p>
              <p className="font-display font-semibold text-lg tabular-nums text-danger">
                {money(kpis.totalPerdido)}
              </p>
            </div>
            <div>
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold mb-1">
                Operaciones
              </p>
              <p className="font-display font-semibold text-lg tabular-nums">
                {metrics?.facturacion?.cantidad ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-auto pt-3 border-t border-foreground/5 flex items-center gap-3">
            <tier.icon className={cn("size-8 shrink-0", tier.accent)} />
            <div>
              <p className="text-[10px] tracking-wider font-mono text-muted-foreground font-semibold">
                Ritmo de cumplimiento
              </p>
              <p className={cn("font-display font-semibold text-sm", tier.accent)}>{tier.label}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card-elevated p-5">
        <div className="mb-4">
          <h3 className="font-display font-semibold">Scorecard del Asesor</h3>
          <p className="text-xs text-muted-foreground">
            Evaluación táctica sobre 5 ejes en escala 0-100
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 section-enter section-enter-2">
          <div className="h-72 lg:col-span-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={scorecard.radar}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="eje"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="valor"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="valor"
                    position="top"
                    fontSize={9}
                    fontWeight={700}
                    fill="var(--color-primary)"
                    formatter={((v: unknown) => `${Number(v).toFixed(1)}%`) as never}
                  />
                </Radar>
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3">
            {scorecard.radar.map((r) => {
              const statusColor =
                r.valor >= 80 ? "text-success" : r.valor >= 60 ? "text-warning" : "text-danger";
              return (
                <div key={r.eje} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{r.eje}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="progress-track w-16"
                      role="progressbar"
                      aria-label={r.eje}
                      aria-valuenow={Math.round(Math.min(100, r.valor))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={cn(
                          "progress-fill",
                          r.valor >= 80 ? "bg-success" : r.valor >= 60 ? "bg-warning" : "bg-danger",
                        )}
                        style={{ transform: `scaleX(${Math.min(100, r.valor) / 100})` }}
                      />
                    </div>
                    <span className={cn("font-semibold tabular-nums w-12 text-right", statusColor)}>
                      {r.valor.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Ticket promedio</p>
              <p className="font-display text-xl font-bold mt-1">
                {money(scorecard.ticketPromedio)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
