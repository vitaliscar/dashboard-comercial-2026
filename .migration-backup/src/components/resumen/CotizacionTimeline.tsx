import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type TimelineRow = { mes: string; monto: number };

interface CotizacionTimelineProps {
  data: TimelineRow[];
  highlightMonths?: string[];
}

/**
 * Línea de tiempo mensual del monto cotizado — sin ejes ni etiquetas de eje,
 * solo la línea, un punto por mes y el monto como etiqueta directa arriba del
 * punto, en números enteros sin decimales y sin abreviar (k/M) vía `money`.
 * El mes que se está analizando (highlightMonths) brilla. El box "Margen
 * Est." de Facturado usa este mismo alto (h-14) para calzar en la misma fila.
 */
export function CotizacionTimeline({ data, highlightMonths = [] }: CotizacionTimelineProps) {
  const hasData = data.some((d) => d.monto > 0);

  return (
    <div className="bg-card rounded-lg border border-border px-3 py-1.5 h-14 flex flex-col justify-between gap-0.5 overflow-hidden">
      {!hasData ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
          Sin datos suficientes
        </div>
      ) : (
        <>
          <div className="flex gap-0.5">
            {data.map((row) => {
              const isHighlighted = highlightMonths.includes(row.mes);
              const hasMonto = row.monto > 0;
              return (
                <span
                  key={row.mes}
                  className={cn(
                    "flex-1 min-w-0 text-center font-mono text-[9px] font-semibold tabular-nums truncate",
                    isHighlighted ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {hasMonto ? money(row.monto) : "—"}
                </span>
              );
            })}
          </div>

          <div className="relative flex items-center gap-0.5">
            {/* Línea horizontal de la línea de tiempo — sin marcas ni etiquetas de eje */}
            <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-px bg-border" />
            {data.map((row) => {
              const isHighlighted = highlightMonths.includes(row.mes);
              return (
                <div key={row.mes} className="relative z-10 flex flex-1 min-w-0 justify-center">
                  <span
                    className={cn(
                      "rounded-full transition-all",
                      isHighlighted
                        ? "size-2 bg-primary shadow-[0_0_6px_1.5px_var(--color-primary)] animate-pulse"
                        : "size-1 bg-muted-foreground/40",
                    )}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
