import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { getAllowedMonths } from "@/lib/date-range";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import {
  getCoordinadorCobranzas,
  getCoordinadorScorecard,
  getCoordinadorYear,
} from "@/lib/paneles-http";
import { money, MESES, pct } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";

export default function CoordinadorPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { data: unidades } = useUnidades();
  const sucursalCount = profile?.sucursales_ids?.length ?? (profile?.sucursal_id ? 1 : 0);
  const handleApplyFilters = useCallback((next: FilterState) => {
    setFilters({
      anio: next.anio,
      meses: next.meses,
      unidades: next.unidades ?? (next.unidad ? [next.unidad] : []),
    });
  }, [setFilters]);
  const allowedMonths = useMemo(() => getAllowedMonths(filters.anio, filters.meses), [filters.anio, filters.meses]);
  const input = {
    anio: filters.anio,
    meses: filters.meses,
    unidades: filters.unidades,
    sucursales: profile?.sucursales_ids ?? [],
  };
  const filterKey = JSON.stringify(input);
  const enabled = role === "coordinador";
  const data = useQuery({
    queryKey: ["coordinador-year", filterKey],
    queryFn: () => getCoordinadorYear(input),
    enabled,
  });
  const scorecard = useQuery({
    queryKey: ["coordinador-scorecard", filterKey],
    queryFn: () => getCoordinadorScorecard(input),
    enabled,
  });
  const receivables = useQuery({
    queryKey: ["coordinador-cobranzas", filterKey],
    queryFn: () => getCoordinadorCobranzas(input),
    enabled,
  });

  const chart = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const rows =
          data.data?.presupuestos.filter(
            (row) => Number(row.mes) === index + 1,
          ) ?? [];
        return {
          mesNumero: index + 1,
          mes: MESES[index]!.slice(0, 3),
          presupuesto: rows.reduce((sum, row) => sum + Number(row.monto), 0),
          venta: rows.reduce(
            (sum, row) =>
              sum +
              Number(row.ventasCcv) +
              Number(row.ventasXibi) +
              Number(row.ventasEstrategicas),
            0,
          ),
        };
      }),
    [data.data],
  );
  const visibleChart = chart.filter((row) => allowedMonths.includes(row.mesNumero));
  const budget = visibleChart.reduce((sum, row) => sum + row.presupuesto, 0);
  const sales = visibleChart.reduce((sum, row) => sum + row.venta, 0);
  const yearLoading = data.isLoading;
  const yearError = data.isError;
  const advisors = useMemo(
    () => [...(scorecard.data?.asesores ?? [])].sort(
      (left, right) => Number(left.pctCumplimiento) - Number(right.pctCumplimiento),
    ),
    [scorecard.data],
  );
  const openReceivables = useMemo(
    () =>
      [...(receivables.data ?? [])]
        .sort((left, right) => Number(right.saldo) - Number(left.saldo))
        .slice(0, 8),
    [receivables.data],
  );

  if (role !== "coordinador") {
    return (
      <p className="card-elevated p-6">
        Este panel está disponible únicamente para coordinadores.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Coordinación"
        title="Panel de coordinador"
        description={`${sucursalCount} sucursales asignadas · gestión de asesores, metas y cartera.`}
        action={
          <Link
            href="/presupuestos"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Repartir presupuesto por asesor
          </Link>
        }
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unidades?.map((unidad) => ({ value: unidad.id, label: unidadLabelInfo(unidad.nombre).label }))}
        defaultMes={filters.meses}
        defaultAnio={filters.anio}
        defaultUnits={filters.unidades}
        showAllMonths
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label={filters.meses === "all" ? "Facturado del año" : "Facturado del período"}
          value={yearLoading || yearError ? "—" : money(sales)}
          hint="CCV, Xibi y estratégicas"
        />
        <KpiCard
          label={filters.meses === "all" ? "Meta del año" : "Meta del período"}
          value={yearLoading || yearError ? "—" : money(budget)}
          hint={yearLoading || yearError ? "Sin datos disponibles" : `${budget ? ((sales / budget) * 100).toFixed(1) : "0.0"}% cumplimiento`}
        />
        <KpiCard
          label="Asesores con cuota"
          value={yearLoading || yearError ? "—" : String(
            (scorecard.data?.asesores ?? []).filter((advisor) => Number(advisor.presupuesto) > 0).length,
          )}
          hint="En tus sucursales asignadas"
        />
      </div>

      <section
        className="card-elevated h-80 p-5"
        data-testid="chart-coordinador-year"
        aria-labelledby="coordinador-year-chart-title"
      >
        <h2 id="coordinador-year-chart-title" className="mb-4 font-display font-semibold">
          Meta y facturación por mes
        </h2>
        {yearLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando datos del período…</p>
        ) : yearError ? (
          <p role="alert" className="py-16 text-center text-sm text-destructive">{data.error.message}</p>
        ) : <>
        <div className="sr-only">
          <table>
            <caption>Presupuesto y venta por mes</caption>
            <thead><tr><th>Mes</th><th>Presupuesto</th><th>Venta</th></tr></thead>
            <tbody>{chart.map((row) => <tr key={row.mes}><th>{row.mes}</th><td>{money(row.presupuesto)}</td><td>{money(row.venta)}</td></tr>)}</tbody>
          </table>
        </div>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={visibleChart}>
            <XAxis dataKey="mes" />
            <YAxis tickFormatter={(value: number) => (Math.abs(value) >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1_000 ? `$${(value / 1_000).toFixed(0)}k` : String(value))} />
            <Tooltip formatter={(value: number) => money(Number(value))} />
            <Legend />
            <Bar
              dataKey="presupuesto"
              name="Presupuesto"
              fill="hsl(var(--muted-foreground))"
            />
            <Bar
              dataKey="venta"
              name="Venta"
              fill="hsl(var(--primary))"
            />
          </BarChart>
        </ResponsiveContainer>
        </>}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card-elevated overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Brecha por asesor</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordenados desde el menor cumplimiento · {advisors.length} asesores en tu alcance.
              </p>
            </div>
            <Link href="/presupuestos" className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">
              Abrir reparto
            </Link>
          </div>
          {scorecard.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">
              Cargando cumplimiento…
            </p>
          ) : scorecard.isError ? (
            <p role="alert" className="p-5 text-sm text-destructive">
              {scorecard.error.message}
            </p>
          ) : advisors.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No hay datos de cumplimiento para este periodo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <caption className="sr-only">Asesores ordenados desde menor cumplimiento, con meta, venta y brecha.</caption>
                <thead>
                  <tr className="sticky top-0 border-b bg-muted text-left text-muted-foreground">
                    <th scope="col" className="p-3 font-medium">Asesor</th>
                    <th scope="col" className="p-3 text-right font-medium">Meta</th>
                    <th scope="col" className="p-3 text-right font-medium">Facturado</th>
                    <th scope="col" className="p-3 text-right font-medium">Brecha</th>
                    <th scope="col" className="p-3 text-right font-medium">Cumplimiento</th>
                    <th scope="col" className="p-3 text-right font-medium">Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {advisors.map((advisor) => (
                    <tr
                      key={advisor.asesorId ?? advisor.codigoAsesor ?? advisor.asesor}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="p-3 font-medium">
                        {advisor.asesor || "Asesor"}
                        {advisor.codigoAsesor && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {advisor.codigoAsesor}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">{money(Number(advisor.presupuesto))}</td>
                      <td className="p-3 text-right font-medium tabular-nums">{money(Number(advisor.venta))}</td>
                      <td className="p-3 text-right tabular-nums">
                        {Number(advisor.presupuesto) > 0 ? money(Math.max(0, Number(advisor.presupuesto) - Number(advisor.venta))) : <span className="text-muted-foreground">Sin meta</span>}
                      </td>
                      <td className={`p-3 text-right font-semibold tabular-nums ${Number(advisor.pctCumplimiento) < 70 ? "text-danger" : Number(advisor.pctCumplimiento) < 90 ? "text-warning" : "text-success"}`}>
                        {pct(Number(advisor.pctCumplimiento))}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {pct(Number(advisor.pctParticipacion))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card-elevated overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-display text-lg font-semibold">
              Cartera pendiente
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clientes con saldo abierto en tus sucursales asignadas.
            </p>
          </div>
          {receivables.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">
              Cargando cartera…
            </p>
          ) : receivables.isError ? (
            <p role="alert" className="p-5 text-sm text-destructive">
              {receivables.error.message}
            </p>
          ) : openReceivables.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No hay saldos pendientes en tu alcance.
            </p>
          ) : (
            <div className="max-h-[30rem] overflow-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 text-right font-medium">Facturado</th>
                    <th className="p-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {openReceivables.map((item) => (
                    <tr
                      key={`${item.cliente}-${item.unidadNegocioId ?? "sin-unidad"}`}
                      className="border-b last:border-0"
                    >
                      <td className="p-3 font-medium">{item.cliente}</td>
                      <td className="p-3 text-right tabular-nums">
                        {money(Number(item.monto))}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {money(Number(item.saldo))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {data.isError && (
        <p className="text-destructive" data-testid="status-coordinador-error">
          {data.error.message}
        </p>
      )}
    </div>
  );
}
