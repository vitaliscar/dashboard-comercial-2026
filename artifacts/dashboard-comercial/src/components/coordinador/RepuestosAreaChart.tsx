import { memo } from "react";
import { AreaChart, Area, LabelList, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import { createLastPointLabel } from "@/lib/chart-labels";
import type { MonthlyRow } from "./GlobalMonthlyCombo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { useChartAnimation } from "@/hooks/use-chart-animation";

const chartConfig = {
  presupuesto: { label: "Presupuesto", color: "var(--color-muted-foreground)" },
  venta: { label: "Venta Total", color: "var(--color-chart-calm-2)" },
} satisfies ChartConfig;

export const RepuestosAreaChart = memo(function RepuestosAreaChart({
  data,
}: {
  data: MonthlyRow[];
}) {
  const chartAnimation = useChartAnimation();
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Ventas Mensuales Repuestos</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="mes"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="presupuesto"
              name="Presupuesto"
              stroke="var(--color-presupuesto)"
              fill="var(--color-presupuesto)"
              fillOpacity={0.12}
              strokeWidth={2}
              {...chartAnimation}
            >
              <LabelList
                dataKey="presupuesto"
                content={createLastPointLabel(
                  data.length,
                  (v) => money(v),
                  "var(--color-muted-foreground)",
                  1,
                )}
              />
            </Area>
            <Area
              type="monotone"
              dataKey="venta"
              name="Venta Total"
              stroke="var(--color-venta)"
              fill="var(--color-venta)"
              fillOpacity={0.25}
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const { cx, cy, index } = props;
                if (index !== data.length - 1) return <g key={`empty-repuestos-${index}`} />;
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill="var(--color-venta)"
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                );
              }}
              {...chartAnimation}
            >
              <LabelList
                dataKey="venta"
                content={createLastPointLabel(data.length, (v) => money(v), "var(--color-venta)", 0)}
              />
            </Area>
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
