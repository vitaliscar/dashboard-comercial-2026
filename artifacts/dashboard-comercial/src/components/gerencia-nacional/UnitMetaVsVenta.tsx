import { memo, useState } from "react";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { money, pct as fmtPct, statusFromPct90 } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  CHART_CATEGORY_AXIS,
  CHART_Y_AXIS_HIDDEN,
  type ChartConfig,
} from "@/components/ui/chart";

export type UnitChartRow = {
  id: string;
  label: string;
  meta: number;
  facturado: number;
  pct: number;
};

const ACCENT_VAR: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

const chartConfig = {
  facturado: { label: "Vendido", color: "var(--color-chart-1)" },
  meta: { label: "Meta", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

import { useChartAnimation } from "@/hooks/use-chart-animation";

type Props = {
  data: UnitChartRow[];
  /** Unit IDs selected via the top unit-filter chips; others dim without being removed. */
  selectedIds?: string[];
};

export const UnitMetaVsVenta = memo(function UnitMetaVsVenta({ data, selectedIds = [] }: Props) {
  const chartAnimation = useChartAnimation();
  const [mode, setMode] = useState<"abs" | "pct">("abs");
  const isSelected = (row: UnitChartRow) =>
    selectedIds.length === 0 || selectedIds.includes(row.id);

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="font-display font-semibold">Meta vs. venta por unidad</CardTitle>
        <SegmentedToggle<"abs" | "pct">
          value={mode}
          onChange={setMode}
          options={[
            { value: "abs", label: "En dólares" },
            { value: "pct", label: "En %" },
          ]}
        />
      </CardHeader>
      <CardContent>
        {mode === "abs" && (
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" role="group" aria-label="Series del gráfico">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: "var(--color-chart-1)" }} />Vendido</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: "var(--color-chart-2)" }} />Meta</span>
          </div>
        )}
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data} barGap={4} barCategoryGap="18%" margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" {...CHART_CATEGORY_AXIS} />
              <YAxis {...CHART_Y_AXIS_HIDDEN} domain={mode === "pct" ? [0, "dataMax + 15"] : [0, "dataMax"]} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex flex-1 items-center justify-between gap-3">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {mode === "pct" ? fmtPct(Number(value)) : money(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              {mode === "abs" && (
                  <Bar
                    dataKey="facturado"
                    name="Vendido"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    {...chartAnimation}
                  >
                    {data.map((row) => {
                      const selected = isSelected(row);
                      return <Cell key={row.id} fill="var(--color-chart-1)" fillOpacity={selected ? 1 : 0.3} />;
                    })}
                  </Bar>
              )}
              {mode === "abs" && (
                  <Bar
                    dataKey="meta"
                    name="Meta"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    {...chartAnimation}
                  >
                    {data.map((row) => {
                      const selected = isSelected(row);
                      return <Cell key={row.id} fill="var(--color-chart-2)" fillOpacity={selected ? 1 : 0.3} />;
                    })}
                  </Bar>
              )}
              {mode === "pct" && (
                <Bar
                  dataKey="pct"
                  name="Cumplimiento %"
                radius={[4, 4, 0, 0]}
                barSize={36}
                label={{
                  position: "top",
                  fontSize: 11,
                  fontWeight: 700,
                  fill: "var(--color-foreground)",
                  formatter: ((v: unknown) => fmtPct(Number(v))) as never,
                }}
                {...chartAnimation}
              >
                {data.map((row) => {
                  const selected = isSelected(row);
                  return <Cell key={row.id} fill={ACCENT_VAR[statusFromPct90(row.pct)]} fillOpacity={selected ? 1 : 0.3} />;
                })}
                </Bar>
              )}
            </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
