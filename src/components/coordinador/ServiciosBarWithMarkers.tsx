import { memo } from "react";
import { ComposedChart, Bar, Scatter, LabelList, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import type { MonthlyRow } from "./GlobalMonthlyCombo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  venta: { label: "Venta Total", color: "var(--color-chart-calm-3)" },
  presupuesto: { label: "Presupuesto", color: "var(--color-chart-calm-4)" },
} satisfies ChartConfig;

type MarkerProps = { cx?: number; cy?: number };

// Renders the "Presupuesto" (meta) marker as a short vertical tick over the bar,
// at the x-position corresponding to the budget value for that month.
function TargetMarker({ cx, cy }: MarkerProps) {
  if (cx == null || cy == null) return null;
  return (
    <rect
      x={cx - 1.5}
      y={cy - 11}
      width={3}
      height={22}
      rx={1.5}
      fill="var(--color-chart-calm-4)"
    />
  );
}

export const ServiciosBarWithMarkers = memo(function ServiciosBarWithMarkers({
  data,
}: {
  data: MonthlyRow[];
}) {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Ventas Mensuales Servicios</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Legend swatches differ in shape (tick vs. bar) — ChartLegendContent only renders
            uniform square swatches, so a custom legend preserves that visual distinction. */}
        <div className="mb-4 flex items-center justify-center gap-4 text-center text-[10px] font-bold">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="h-3 w-1 rounded-sm bg-(--color-chart-calm-4)" aria-hidden="true" />
            <span>Presupuesto (meta)</span>
          </span>
          <span className="inline-flex items-center gap-2 text-primary">
            <span className="size-3 rounded-sm bg-(--color-chart-calm-3)" aria-hidden="true" />
            <span>Venta total</span>
          </span>
        </div>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <ComposedChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
          >
            <XAxis type="number" tick={false} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="mes"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              width={56}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
            />
            <Bar
              dataKey="venta"
              name="Venta Total"
              fill="var(--color-venta)"
              barSize={22}
              radius={[4, 4, 4, 4]}
            >
              <LabelList
                dataKey="venta"
                position="insideLeft"
                fontSize={10}
                fontWeight={700}
                fill="var(--color-foreground)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
            </Bar>
            <Scatter dataKey="presupuesto" name="Presupuesto" shape={TargetMarker as never} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
