import { memo, useState } from "react";
import { Bar, Line, ComposedChart, XAxis, YAxis, Cell, LabelList } from "recharts";
import { money, pct as fmtPct, statusFromPct90 } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
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
  pct: { label: "Cumplimiento %", color: "var(--color-primary)" },
  facturado: { label: "Vendido", color: "var(--color-primary)" },
  meta: { label: "Meta", color: "var(--color-success)" },
} satisfies ChartConfig;

type Props = {
  data: UnitChartRow[];
  /** Unit IDs selected via the top unit-filter chips; others dim without being removed. */
  selectedIds?: string[];
};

export const UnitMetaVsVenta = memo(function UnitMetaVsVenta({ data, selectedIds = [] }: Props) {
  const [mode, setMode] = useState<"abs" | "pct">("abs");
  const isSelected = (row: UnitChartRow) =>
    selectedIds.length === 0 || selectedIds.includes(row.id);

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="font-display font-semibold">Meta vs. venta por unidad</CardTitle>
        <SegmentedToggle
          value={mode}
          onChange={setMode}
          options={[
            { value: "abs", label: "En dólares" },
            { value: "pct", label: "En %" },
          ]}
        />
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          {mode === "pct" ? (
            <ComposedChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent formatter={(value) => fmtPct(Number(value))} />}
              />
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
              >
                {data.map((row) => {
                  const selected = isSelected(row);
                  return (
                    <Cell
                      key={row.id}
                      fill={ACCENT_VAR[statusFromPct90(row.pct)]}
                      fillOpacity={selected ? 1 : 0.3}
                      stroke={
                        selected && selectedIds.length > 0 ? "var(--color-foreground)" : undefined
                      }
                      strokeWidth={selected && selectedIds.length > 0 ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            </ComposedChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="facturado"
                name="Vendido"
                radius={[4, 4, 0, 0]}
                barSize={36}
                label={{
                  position: "top",
                  fontSize: 11,
                  fontWeight: 700,
                  fill: "var(--color-foreground)",
                  formatter: ((v: unknown) => money(Number(v))) as never,
                }}
              >
                {data.map((row) => {
                  const selected = isSelected(row);
                  return (
                    <Cell
                      key={row.id}
                      fill="var(--color-facturado)"
                      fillOpacity={selected ? 1 : 0.3}
                      stroke={
                        selected && selectedIds.length > 0 ? "var(--color-foreground)" : undefined
                      }
                      strokeWidth={selected && selectedIds.length > 0 ? 2 : 0}
                    />
                  );
                })}
                <LabelList
                  dataKey="pct"
                  position="insideBottom"
                  offset={6}
                  fill="var(--color-primary-foreground)"
                  fontSize={10}
                  fontWeight={700}
                  formatter={((v: unknown) => fmtPct(Number(v))) as never}
                />
              </Bar>
              <Line
                type="monotone"
                dataKey="meta"
                name="Meta"
                stroke="var(--color-meta)"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                label={{
                  position: "top",
                  fontSize: 11,
                  fontWeight: 700,
                  fill: "var(--color-success)",
                  formatter: ((v: unknown) => money(Number(v))) as never,
                }}
              />
            </ComposedChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
