import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, Target, TrendingUp, Wrench } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { getResumenData } from "@/lib/api-data";
import { getMonthlySalesProjection } from "@/lib/business-days";
import { MESES, money, pct } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";

/**
 * Vista HTTP del módulo de Servicios. Mantiene el KPI y la proyección en el
 * cliente usando el mismo endpoint autenticado que Resumen, sin importar
 * Server Actions ni módulos de base de datos en el bundle de Vite.
 */
export default function ServiciosLivePage() {
  const { session, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const monthParam = meses === "all" ? "all" : meses.join(",");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["servicios-live", anio, monthParam, profile?.sucursal_id, profile?.unidad_negocio_id],
    enabled: Boolean(session),
    queryFn: () =>
      getResumenData({
        anio,
        meses: monthParam,
        sucursalId: profile?.sucursal_id ?? undefined,
        unidadNegocioId: profile?.unidad_negocio_id ?? undefined,
      }),
  });

  const totals = useMemo(() => {
    const rows = data?.presupuestos ?? [];
    const target = rows.reduce((sum, row) => sum + Number(row.monto ?? 0), 0);
    const sales = rows.reduce(
      (sum, row) =>
        sum +
        Number(row.ventasCcv ?? 0) +
        Number(row.ventasXibi ?? 0) +
        Number(row.ventasEstrategicas ?? 0),
      0,
    );
    const serviceSales = (data?.servicios ?? []).reduce(
      (sum, row) => sum + Number(row.montoTotal ?? 0),
      0,
    );
    return {
      target,
      sales,
      serviceSales,
      compliance: target > 0 ? (sales / target) * 100 : 0,
    };
  }, [data]);

  const projection = useMemo(
    () => getMonthlySalesProjection(totals.sales, totals.target, anio, meses),
    [anio, meses, totals.sales, totals.target],
  );

  const handleMonthChange = (value: string) => {
    setFilters({ meses: value === "all" ? "all" : [Number(value)] });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="UNIDAD DE NEGOCIO"
          title="Servicios"
          description="Talleres y servicios estratégicos"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="card-elevated h-36 animate-pulse bg-card/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="UNIDAD DE NEGOCIO"
        title="Servicios"
        description="Talleres y servicios estratégicos · datos reales del período seleccionado"
      />

      <div className="card-elevated flex flex-wrap items-end gap-4 p-4">
        <label className="flex min-w-40 flex-col gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Meses
          </span>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={meses === "all" ? "all" : String(meses[0] ?? "all")}
            onChange={(event) => handleMonthChange(event.target.value)}
          >
            <option value="all">Todos los meses</option>
            {MESES.map((mes, index) => (
              <option key={mes} value={index + 1}>
                {mes}
              </option>
            ))}
          </select>
        </label>
        <div className="pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Año {anio}
        </div>
        {isError && (
          <p className="pb-2 text-xs text-danger">
            No se pudo cargar el resumen autenticado de Servicios.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas consolidadas"
          value={money(totals.sales)}
          accent="ochre"
          icon={TrendingUp}
          projection={
            projection
              ? { value: money(projection.projectedSales), tone: projection.tone }
              : undefined
          }
          hint="Talleres + CSA + ventas internas"
        />
        <KpiCard
          label="Meta del período"
          value={money(totals.target)}
          accent="primary"
          icon={Target}
          hint={`${meses === "all" ? "Acumulado anual" : "Objetivo de " + (MESES[(meses[0] ?? 1) - 1] ?? "")}`}
        />
        <KpiCard
          label="Cumplimiento"
          value={pct(totals.compliance)}
          accent={totals.compliance >= 100 ? "success" : totals.compliance >= 70 ? "warning" : "danger"}
          icon={Gauge}
          progress={totals.compliance}
          hint="Venta contra meta"
        />
        <KpiCard
          label="Servicios facturados"
          value={money(totals.serviceSales)}
          accent="success"
          icon={Wrench}
          hint="Registros de Servicios"
        />
      </div>

      <section className="card-elevated grid gap-4 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            Control de cierre
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold">Ritmo de ventas de Servicios</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La proyección usa días hábiles transcurridos y la meta del período, sin sustituir el
            monto real facturado.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Estado de proyección</span>
            <span
              className={
                projection?.tone === "success"
                  ? "font-mono text-xs font-bold text-success"
                  : projection?.tone === "warning"
                    ? "font-mono text-xs font-bold text-warning"
                    : "font-mono text-xs font-bold text-danger"
              }
            >
              {projection ? projection.tone === "success" ? "Sobre meta" : projection.tone === "warning" ? "En seguimiento" : "Bajo meta" : "Sin proyección"}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={
                projection?.tone === "success"
                  ? "h-full rounded-full bg-success"
                  : projection?.tone === "warning"
                    ? "h-full rounded-full bg-warning"
                    : "h-full rounded-full bg-danger"
              }
              style={{ width: `${Math.min(Math.max(totals.compliance, 0), 100)}%` }}
            />
          </div>
          <p className="mt-2 text-right font-mono text-[11px] text-muted-foreground">
            {pct(totals.compliance)} de cumplimiento
          </p>
        </div>
      </section>
    </div>
  );
}