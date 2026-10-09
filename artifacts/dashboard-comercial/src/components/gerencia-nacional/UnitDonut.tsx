import { memo } from "react";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  /** `id` is used by callers that dim unselected business units. */
  data: { id?: string; label: string; facturado: number }[];
  title?: string;
  selectedIds?: string[];
};

const UNIT_COLORS = [
  "var(--unit-chart-servicios)",
  "var(--unit-chart-repuestos)",
  "var(--unit-chart-lubfiltros)",
  "var(--unit-chart-equipos)",
  "var(--unit-chart-alquiler)",
];
const COMPANY_COLORS = [
  "var(--color-chart-calm-1)",
  "var(--color-chart-calm-2)",
  "var(--color-chart-calm-3)",
];

function colorFor(label: string, index: number) {
  const normalized = label.toLocaleLowerCase();
  if (normalized.includes("venequip") || normalized.includes("ccv")) return COMPANY_COLORS[0];
  if (normalized.includes("xibi")) return COMPANY_COLORS[1];
  if (normalized.includes("estratég") || normalized.includes("estrateg")) return COMPANY_COLORS[2];
  if (normalized.includes("servicio")) return UNIT_COLORS[0];
  if (normalized.includes("repuesto")) return UNIT_COLORS[1];
  if (normalized.includes("lub") || normalized.includes("filtro")) return UNIT_COLORS[2];
  if (normalized.includes("equipo")) return UNIT_COLORS[3];
  if (normalized.includes("alquiler")) return UNIT_COLORS[4];
  return UNIT_COLORS[index % UNIT_COLORS.length];
}

/** Labeled distribution bars keep the amount and share readable at every width. */
export const UnitDonut = memo(function UnitDonut({
  data,
  title = "Distribución por unidad",
  selectedIds = [],
}: Props) {
  const total = data.reduce((sum, row) => sum + Math.max(0, Number.isFinite(row.facturado) ? row.facturado : 0), 0);

  return (
    <Card className="card-elevated flex h-full min-w-0 flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos para el período.</p>
        ) : (
          <ul className="space-y-3" aria-label={title || "Distribución por categoría"}>
            {data.map((row, index) => {
              const amount = Number.isFinite(row.facturado) ? row.facturado : 0;
              const share = total > 0 ? Math.max(0, amount) / total * 100 : 0;
              const isSelected = selectedIds.length === 0 || (!!row.id && selectedIds.includes(row.id));
              const color = colorFor(row.label, index);
              return (
                <li key={row.id ?? row.label} className="min-w-0" style={{ opacity: isSelected ? 1 : 0.48 }}>
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 truncate text-xs font-medium text-foreground">
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="truncate">{row.label}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <strong className="font-mono text-xs font-semibold tabular-nums text-foreground">{money(amount)}</strong>
                      <span className="ml-2 font-mono text-[11px] tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${row.label} del total facturado`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={share}
                    aria-valuetext={`${share.toFixed(1)}% del total, ${money(amount)}`}
                  >
                    <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
});
