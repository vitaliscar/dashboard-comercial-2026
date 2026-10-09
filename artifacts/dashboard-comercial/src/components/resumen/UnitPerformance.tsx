import type { FacturadoMetrica, UnidadNegocio } from "@/lib/resumen-types";
import { money } from "@/lib/format";

interface UnitPerformanceProps {
  rows?: FacturadoMetrica[];
}

function statusFor(value: number) {
  if (value >= 100) return { label: "Meta alcanzada", text: "text-success" };
  if (value >= 80) return { label: "Cerca de la meta", text: "text-warning" };
  return { label: "Requiere atención", text: "text-danger" };
}

const UNIT_COLORS: Record<UnidadNegocio, string> = {
  Servicios: "var(--unit-chart-servicios)",
  Repuestos: "var(--unit-chart-repuestos)",
  "Lub / Filtros": "var(--unit-chart-lubfiltros)",
  Equipos: "var(--unit-chart-equipos)",
  Alquiler: "var(--unit-chart-alquiler)",
};

export function UnitPerformance({ rows = [] }: UnitPerformanceProps) {
  const visibleRows = rows.filter((row) => row.monto > 0 || (row.presupuestoTotal ?? 0) > 0);

  return (
    <section
      className="ccv-unit-performance overflow-hidden rounded-xl border border-border bg-card"
      aria-labelledby="unit-performance-title"
    >
      <header className="flex flex-wrap items-end justify-between gap-2 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-primary">
            Desempeño
          </p>
          <h2 id="unit-performance-title" className="mt-1 text-base font-semibold text-foreground">
            Cumplimiento por unidad
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Facturación y meta del período seleccionado.
          </p>
        </div>
        {visibleRows.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {visibleRows.length} {visibleRows.length === 1 ? "unidad" : "unidades"}
          </span>
        )}
      </header>

      {visibleRows.length === 0 ? (
        <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground sm:px-5">
          No hay facturación ni metas para este período con los filtros actuales.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border" aria-label="Unidades de negocio">
          {visibleRows.map((row) => {
            const target = row.presupuestoTotal ?? 0;
            const rate = Number.isFinite(row.cumplimiento) ? row.cumplimiento : 0;
            const status = statusFor(rate);

            return (
              <li
                key={row.unidad}
                className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3 sm:px-5"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{row.unidad}</span>
                    <span className={`shrink-0 font-mono text-xs font-semibold tabular-nums sm:hidden ${target > 0 ? status.text : "text-muted-foreground"}`}>
                      {target > 0 ? `${rate.toFixed(1)}%` : "Sin meta"}
                    </span>
                  </div>
                  {target > 0 ? (
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`Cumplimiento de ${row.unidad}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(Math.max(rate, 0), 100)}
                      aria-valuetext={`${rate.toFixed(1)}% de la meta. ${status.label}.`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.min(Math.max(rate, 0), 100)}%`,
                          backgroundColor: UNIT_COLORS[row.unidad],
                        }}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Sin meta configurada</p>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="block text-[10px] text-muted-foreground">Facturado</span>
                  <strong className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {money(row.monto)}
                  </strong>
                </div>

                <div className="min-w-0">
                  <span className="block text-[10px] text-muted-foreground">Meta</span>
                  <strong className="font-mono text-sm font-medium tabular-nums text-foreground">
                    {target > 0 ? money(target) : "—"}
                  </strong>
                </div>

                <div className="hidden sm:block">
                  <span className="block text-[10px] text-muted-foreground">Avance</span>
                  <strong className={`font-mono text-sm font-semibold tabular-nums ${target > 0 ? status.text : "text-muted-foreground"}`}>
                    {target > 0 ? `${rate.toFixed(1)}%` : "—"}
                  </strong>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
