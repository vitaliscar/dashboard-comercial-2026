import { memo, useMemo } from "react";
import { Grid2X2 } from "lucide-react";
import { abbreviateSucursal, money, pct, statusFromPct90 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BranchSummaryRow } from "./BranchSummaryTable";
import type { UnitChartRow } from "./UnitMetaVsVenta";

export type BranchUnitMetric = {
  sucursalId: string;
  unidadNegocioId: string;
  meta: number;
  facturado: number;
};

type HeatValue = {
  meta: number;
  facturado: number;
};

const HEAT_CLASS = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
} as const;

function CellValue({
  value,
  label,
  onClick,
}: {
  value?: HeatValue;
  label: string;
  onClick?: () => void;
}) {
  if (!value || (value.meta <= 0 && value.facturado <= 0)) {
    return (
      <span
        role="img"
        className="flex min-h-9 items-center justify-center rounded-md bg-muted/60 px-2 text-xs text-muted-foreground"
        aria-label={`${label}: sin datos`}
        title={`${label}: sin datos para este período`}
      >
        –
      </span>
    );
  }

  if (value.meta <= 0) {
    const content = "S/M";
    const className = "flex min-h-9 w-full items-center justify-center rounded-md bg-muted/60 px-2 text-[10px] font-semibold text-muted-foreground";
    if (onClick && value.facturado > 0) {
      return (
        <button
          type="button"
          onClick={onClick}
          className={cn(className, "cursor-pointer hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground")}
          aria-label={`${label}: sin meta, ${money(value.facturado)} facturado. Abrir detalle.`}
          title={`${label}: ${money(value.facturado)} facturado · sin meta asignada`}
        >
          {content}
        </button>
      );
    }
    return (
      <span
        role="img"
        className={className}
        aria-label={`${label}: sin meta, ${money(value.facturado)} facturado`}
        title={`${label}: ${money(value.facturado)} facturado · sin meta asignada`}
      >
        S/M
      </span>
    );
  }

  const progress = (value.facturado / value.meta) * 100;
  const status = statusFromPct90(progress);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex min-h-9 w-full items-center justify-center rounded-md px-2 font-mono text-xs font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
        onClick && "cursor-pointer hover:brightness-95",
        !onClick && "cursor-default",
        HEAT_CLASS[status],
      )}
      aria-label={`${label}: ${pct(progress, 1)}, ${money(value.facturado)} facturado de ${money(value.meta)} de meta`}
      title={`${label}: ${money(value.facturado)} de ${money(value.meta)}`}
    >
      {pct(progress, 1)}
    </button>
  );
}

export const UnitComplianceHeatmap = memo(function UnitComplianceHeatmap({
  branches,
  units,
  values,
  selectedUnitIds = [],
  onSelectCell,
  onSelectBranch,
}: {
  branches: BranchSummaryRow[];
  units: UnitChartRow[];
  values: BranchUnitMetric[];
  selectedUnitIds?: string[];
  onSelectCell?: (sucursalId: string, unidadNegocioId: string) => void;
  onSelectBranch?: (sucursalId: string) => void;
}) {
  const valuesByBranch = useMemo(() => {
    const result = new Map<string, Map<string, HeatValue>>();
    values.forEach((value) => {
      const unitsByBranch = result.get(value.sucursalId) ?? new Map<string, HeatValue>();
      unitsByBranch.set(value.unidadNegocioId, value);
      result.set(value.sucursalId, unitsByBranch);
    });
    return result;
  }, [values]);

  const hasData = branches.length > 0 && units.length > 0;
  const totalLabel = selectedUnitIds.length > 0 ? "Total filtrado" : "Total";
  const visibleUnits = selectedUnitIds.length > 0
    ? units.filter((unit) => selectedUnitIds.includes(unit.id))
    : units;

  return (
    <section className="card-elevated section-enter overflow-hidden" aria-labelledby="unit-compliance-title">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Grid2X2 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="unit-compliance-title" className="font-display text-sm font-semibold">
              Matriz de cumplimiento: sucursal por unidad
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Facturado frente a meta por sucursal · valores del período seleccionado
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium" aria-label="Leyenda de cumplimiento">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            En meta ≥90%
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-warning">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
            En avance 70–89%
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-danger">
            <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
            Requiere atención &lt;70%
          </span>
        </div>
      </header>

      {!hasData ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No hay datos de metas y facturación para mostrar en esta selección.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto min-[720px]:block">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">
                Matriz de cumplimiento de facturación contra meta por sucursal y unidad de negocio
              </caption>
              <thead>
                <tr className="bg-muted/45">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-40 border-b border-border bg-muted/95 px-4 py-3 text-left font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
                  >
                    Sucursal
                  </th>
                  {visibleUnits.map((unit) => (
                      <th
                        key={unit.id}
                        scope="col"
                        className={cn(
                          "min-w-24 border-b border-border px-2 py-3 text-center font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                        )}
                        title={unit.label}
                      >
                        {unit.label}
                      </th>
                  ))}
                  <th
                    scope="col"
                    className="min-w-24 border-b border-border px-2 py-3 text-center font-display text-[10px] font-semibold uppercase tracking-wider text-foreground"
                    title={selectedUnitIds.length > 0 ? "Total de las unidades seleccionadas" : "Total de todas las unidades"}
                  >
                    {totalLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => {
                  const unitsByBranch = valuesByBranch.get(branch.id);
                  return (
                    <tr key={branch.id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] border-b border-border/70 bg-card px-4 py-2.5 text-left font-medium text-foreground group-hover:bg-muted/40"
                        title={branch.label}
                      >
                        {abbreviateSucursal(branch.label)}
                      </th>
                      {visibleUnits.map((unit) => (
                          <td key={unit.id} className="border-b border-border/70 p-1.5">
                            <CellValue
                              value={unitsByBranch?.get(unit.id)}
                              label={`${branch.label} · ${unit.label}`}
                              onClick={onSelectCell ? () => onSelectCell(branch.id, unit.id) : undefined}
                            />
                          </td>
                      ))}
                      <td className="border-b border-border/70 bg-muted/20 p-1.5">
                        <CellValue
                          value={{ meta: branch.meta, facturado: branch.facturado }}
                          label={`${branch.label} · total ${selectedUnitIds.length > 0 ? "filtrado" : "general"}`}
                          onClick={onSelectBranch ? () => onSelectBranch(branch.id) : undefined}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border min-[720px]:hidden">
            {branches.map((branch) => {
              const unitsByBranch = valuesByBranch.get(branch.id);
              return (
                <article key={branch.id} className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="truncate text-xs font-semibold text-foreground" title={branch.label}>
                      {branch.label}
                    </h3>
                    <div className="w-24 shrink-0">
                      <CellValue
                        value={{ meta: branch.meta, facturado: branch.facturado }}
                        label={`${branch.label} · total ${selectedUnitIds.length > 0 ? "filtrado" : "general"}`}
                        onClick={onSelectBranch ? () => onSelectBranch(branch.id) : undefined}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {visibleUnits.map((unit) => (
                        <div key={unit.id} className="min-w-0">
                          <div className="mb-1 truncate text-[10px] text-muted-foreground" title={unit.label}>
                            {unit.label}
                          </div>
                          <CellValue
                            value={unitsByBranch?.get(unit.id)}
                            label={`${branch.label} · ${unit.label}`}
                            onClick={onSelectCell ? () => onSelectCell(branch.id, unit.id) : undefined}
                          />
                        </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
});
