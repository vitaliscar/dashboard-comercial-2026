import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
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
  const { filters } = useSharedFilters();
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
  const budget = chart.reduce((sum, row) => sum + row.presupuesto, 0);
  const sales = chart.reduce((sum, row) => sum + row.venta, 0);
  const yearLoading = data.isLoading;
  const yearError = data.isError;
  const advisors = useMemo(
    () =>
      [...(scorecard.data?.asesores ?? [])]
        .sort((left, right) => Number(right.venta) - Number(left.venta))
        .slice(0, 8),
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
        description="Venta, metas, equipo y cartera pendientes dentro de las sucursales que tienes asignadas."
        action={
          <Link
            href="/presupuestos"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Repartir presupuesto por asesor
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Venta anual"
          value={yearLoading || yearError ? "—" : money(sales)}
          hint="CCV, Xibi y estratégicas"
        />
        <KpiCard
          label="Presupuesto anual"
          value={yearLoading || yearError ? "—" : money(budget)}
          hint={yearLoading || yearError ? "Sin datos disponibles" : `${budget ? ((sales / budget) * 100).toFixed(1) : "0.0"}% cumplimiento`}
        />
        <KpiCard
          label="Unidades activas"
          value={yearLoading || yearError ? "—" : String(
            new Set(
              data.data?.presupuestos.map((row) => row.unidadNegocioId) ?? [],
            ).size,
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
          Presupuesto y venta por mes
        </h2>
        {yearLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando datos anuales…</p>
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
          <BarChart data={chart}>
            <XAxis dataKey="mes" />
            <YAxis />
            <Tooltip formatter={(value: number) => money(Number(value))} />
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
              <h2 className="font-display text-lg font-semibold">
                Cumplimiento por asesor
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cumplimiento acumulado y proporción de la venta del equipo en el periodo.
              </p>
            </div>
            <Link
              href="/presupuestos"
              className="shrink-0 text-sm font-semibold text-primary hover:underline"
            >
              Distribuir meta
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
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-3 font-medium">Asesor</th>
                    <th className="p-3 text-right font-medium">Venta</th>
                    <th className="p-3 text-right font-medium">Cumplimiento</th>
                    <th className="p-3 text-right font-medium">Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {advisors.map((advisor) => (
                    <tr
                      key={advisor.asesorId ?? advisor.codigoAsesor ?? advisor.asesor}
                      className="border-b last:border-0"
                    >
                      <td className="p-3 font-medium">
                        {advisor.asesor || "Asesor"}
                        {advisor.codigoAsesor && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {advisor.codigoAsesor}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {money(Number(advisor.venta))}
                      </td>
                      <td className="p-3 text-right tabular-nums">
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
            <div className="overflow-x-auto">
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
