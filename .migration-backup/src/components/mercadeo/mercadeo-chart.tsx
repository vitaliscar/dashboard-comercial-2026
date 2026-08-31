"use client";

/** Paleta compartida por gráficos del módulo Mercadeo. */
export const MERCADEO_COLORES = [
  "var(--color-chart-calm-1)",
  "var(--color-chart-calm-2)",
  "var(--color-chart-calm-3)",
  "var(--color-chart-calm-4)",
  "var(--color-chart-calm-5)",
  "var(--color-primary)",
  "var(--color-ochre)",
];

export const MERCADEO_TOOLTIP_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
};

type TooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
};

export function MercadeoChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
      style={MERCADEO_TOOLTIP_STYLE}
    >
      <p className="mb-1.5 font-display font-semibold text-foreground">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {Number(entry.value ?? 0).toLocaleString("es-VE")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
