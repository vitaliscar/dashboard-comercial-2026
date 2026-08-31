import { memo } from "react";
import { ComposedChart, Bar, Cell, Line, LabelList, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import { createChartLabel, createLastPointLabel } from "@/lib/chart-labels";
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

export type MonthlyRow = { mes: string; presupuesto: number; venta: number };

const chartConfig = {
  venta: { label: "Venta Total", color: "var(--color-chart-calm-1)" },
  presupuesto: { label: "Presupuesto", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

export const GlobalMonthlyCombo = memo(function GlobalMonthlyCombo({
  data,
  highlightMonths = [],
}: {
  data: MonthlyRow[];
  /** Meses (abreviados, ej. "Jul") a resaltar — el resto se atenúa. Vacío = todos iguales. */
  highlightMonths?: string[];
}) {
  const chartAnimation = useChartAnimation();
  const hasHighlight = highlightMonths.length > 0;
  const chartData = data.map((row) => {
    const cumplimiento = row.presupuesto > 0 ? (row.venta / row.presupuesto) * 100 : 0;
    return { ...row, cumplimiento };
  });

  return (
    // ChartContainer tiene h-[360px] fijo → ResponsiveContainer siempre
    // mide un alto concreto y Recharts no tira "width(-1) height(-1)".
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">
          Presupuesto vs Cumplimiento Mensual Global
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[360px] w-full">
          <ComposedChart data={chartData} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
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
            <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
            <Bar
              dataKey="venta"
              name="Venta Total"
              fill="var(--color-venta)"
              radius={[4, 4, 0, 0]}
              {...chartAnimation}
            >
              {hasHighlight &&
                chartData.map((row) => (
                  <Cell
                    key={row.mes}
                    fill="var(--color-venta)"
                    opacity={highlightMonths.includes(row.mes) ? 1 : 0.35}
                  />
                ))}
              <LabelList
                dataKey="venta"
                content={createChartLabel({
                  formatter: (v) => money(v),
                  fill: "var(--color-foreground)",
                  dy: -8,
                })}
              />
              <LabelList
                dataKey="cumplimiento"
                content={createChartLabel({
                  formatter: (v) => `${v.toFixed(0)}%`,
                  fill: "var(--color-foreground)",
                  fontSize: 9,
                  minSegmentHeight: 32,
                  skipEmpty: false,
                })}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="presupuesto"
              name="Presupuesto"
              stroke="var(--color-presupuesto)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "var(--color-card)", strokeWidth: 2 }}
              {...chartAnimation}
            >
              <LabelList
                dataKey="presupuesto"
                content={createChartLabel({
                  formatter: (v) => money(v),
                  fill: "var(--color-muted-foreground)",
                  dy: 14,
                  fontSize: 9,
                })}
              />
            </Line>
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
