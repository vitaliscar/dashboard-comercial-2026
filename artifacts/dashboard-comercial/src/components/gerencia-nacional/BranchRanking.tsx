import { memo } from "react";
import { ArrowUpRight, Building2 } from "@/components/icons";
import { money, statusFromPct90 } from "@/lib/format";
import type { BranchSummaryRow } from "./BranchSummaryTable";

const STATUS_CLASS = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

const STATUS_BAR_CLASS = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

const STATUS_LABEL = {
  success: "En meta",
  warning: "En avance",
  danger: "Requiere atención",
} as const;

export const BranchRanking = memo(function BranchRanking({
  rows,
  onSelect,
}: {
  rows: BranchSummaryRow[];
  onSelect?: (sucursalId: string) => void;
}) {
  const ranked = [...rows].sort((a, b) => a.pct - b.pct);
  const priorityRows = ranked.slice(0, 6);
  const remainingRows = ranked.slice(6);

  return (
    <section className="card-elevated overflow-hidden" aria-labelledby="branch-priority-title">
      <header className="border-b border-border p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <Building2 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="branch-priority-title" className="font-display text-sm font-semibold">
              Sucursales con mayor brecha
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ordenadas desde el menor cumplimiento. Abre una para revisar su detalle.
            </p>
          </div>
        </div>
      </header>

      {ranked.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No hay sucursales con datos en este período.</p>
      ) : (
        <>
          <ol className="divide-y divide-border">
            {priorityRows.map((row, index) => {
              const status = statusFromPct90(row.pct);
              const gap = row.meta - row.facturado;
              const content = (
                <>
                  <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-foreground">{row.label}</span>
                      <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${STATUS_CLASS[status]}`}>
                        {row.pct.toFixed(1)}%
                      </span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${STATUS_BAR_CLASS[status]}`}
                        style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                      />
                    </span>
                    <span className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{row.meta <= 0 ? "Sin meta" : STATUS_LABEL[status]} · facturado {money(row.facturado)} de {money(row.meta)}</span>
                      <span className={gap > 0 ? "text-danger" : "text-success"}>
                        {row.meta <= 0 ? "Meta sin asignar" : gap > 0 ? `Faltan ${money(gap)}` : `Sobre meta ${money(Math.abs(gap))}`}
                      </span>
                    </span>
                  </span>
                  {onSelect && <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </>
              );

              return (
                <li key={row.id}>
                  {onSelect ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary"
                      onClick={() => onSelect(row.id)}
                      aria-label={`${row.label}: ${row.meta <= 0 ? "sin meta asignada" : `${row.pct.toFixed(1)}% de cumplimiento, faltan ${money(Math.max(0, gap))}`}. Abrir el resumen de esta sucursal.`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ol>

          {remainingRows.length > 0 && (
            <details className="border-t border-border">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-primary hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                Ver las otras {remainingRows.length} sucursales
              </summary>
              <ol start={priorityRows.length + 1} className="divide-y divide-border">
                {remainingRows.map((row, index) => {
                  const status = statusFromPct90(row.pct);
                  const gap = row.meta - row.facturado;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => onSelect?.(row.id)}
                        disabled={!onSelect}
                        aria-label={`${row.label}: ${row.pct.toFixed(1)}% de cumplimiento. Abrir su resumen.`}
                      >
                        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {String(priorityRows.length + index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
                        <span className={`font-mono text-sm font-semibold tabular-nums ${STATUS_CLASS[status]}`}>
                          {row.pct.toFixed(1)}%
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {row.meta <= 0 ? "Sin meta" : gap > 0 ? `Faltan ${money(gap)}` : `Sobre meta ${money(Math.abs(gap))}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
});
