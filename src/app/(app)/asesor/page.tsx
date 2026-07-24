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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { TrendingUp, Target, Zap, Calendar, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

export default function AsesorPage() {
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
    queryFn: () => getAsesorMetricsAction({ anio, meses, ranges: dateRanges, unidades: selectedUnidades }),
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
        const m = new Date(r.fecha).getMonth();
        byMonth[m].ventas += Number(r.monto);
      });

      pData.forEach((r) => {
        byMonth[r.mes - 1].presupuesto += Number(r.presupuesto ?? 0);
      });

      if (meses !== "all") {
        const allowedShortNames = meses.map((m) => MESES[m - 1].slice(0, 3));
        return byMonth.filter((item) => allowedShortNames.includes(item.mes));
      } else {
        const monthCap = getAllMonthsCap(anio);
        return byMonth.slice(0, monthCap);
      }
    },
  });

  const kpis = useMemo(() => {
    const totalFacturado = metrics?.facturacion.reduce((a, r) => a + Number(r.monto ?? 0), 0) ?? 0;
    const totalPresupuesto =
      metrics?.presupuestos.reduce((a, r) => a + Number(r.presupuesto ?? 0), 0) ?? 0;
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

  const cumplimientoStatus = statusFromPct(kpis.cumplimiento);

  const scorecard = useMemo(() => {
    const ventas = metrics?.facturacion ?? [];
    const cotizaciones = metrics?.cotizaciones ?? [];
    const minutas = metrics?.minutas ?? [];
    const scoreAsesor = metrics?.scoreAsesor ?? [];

    const conversion = cotizaciones.length > 0 ? (ventas.length / cotizaciones.length) * 100 : 0;
    const ticketPromedio = ventas.length > 0 ? kpis.totalFacturado / ventas.length : 0;
    const ticketNorm = Math.min(100, (ticketPromedio / 5000) * 100);
    const disciplina =
      minutas.length > 0
        ? (minutas.filter((m) => {
            if (m.estado !== "cumplido") return false;
            if (!m.fechaLimite) return true;
            return new Date(m.fechaLimite).getTime() >= Date.now() - 86400000;
          }).length /
            minutas.length) *
          100
        : 100;
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

  return (
    <div className="flex flex-col gap-6 max-w-400">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-elevated p-5 lg:col-span-2">
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
                  name="Ventas"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5 flex flex-col gap-4">
          <h3 className="font-display font-semibold">Resumen</h3>
          <div className="flex flex-col gap-3 text-sm">
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
                {metrics?.facturacion?.length ?? 0}
              </p>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                />
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
