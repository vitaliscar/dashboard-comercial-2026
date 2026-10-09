import { memo } from "react";
import { ComposedChart, Bar, Cell, Line, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
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
  presupuesto: { label: "Presupuesto", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

export const GlobalMonthlyCombo = memo(function GlobalMonthlyCombo({
  data,
  highlightMonths = [],
}: {
  data: MonthlyRow[];
  /** Meses (abreviados, ej. "Jul") a resaltar – el resto se atenúa. Vacío = todos iguales. */
  highlightMonths?: string[];
}) {
  const chartAnimation = useChartAnimation();
  const hasHighlight = highlightMonths.length > 0;
  const chartData = data;

  return (
    // ChartContainer conserva una altura explícita para que ResponsiveContainer
    // calcule el SVG correctamente y la gráfica no domine el móvil.
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">
          Venta y presupuesto mensual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full sm:h-[310px]">
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
              content={
                <ChartTooltipContent
                  formatter={(value) => money(Number(value))}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as MonthlyRow | undefined;
                    if (!row) return label;
                    const rate = row.presupuesto > 0 ? (row.venta / row.presupuesto) * 100 : null;
                    return `${row.mes} · ${rate === null ? "Sin meta" : `${rate.toLocaleString("es-VE", { maximumFractionDigits: 1 })}% de meta`}`;
                  }}
                />
              }
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
            </Bar>
            <Line
              type="monotone"
              dataKey="presupuesto"
              name="Presupuesto"
              stroke="var(--color-presupuesto)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "var(--color-card)", strokeWidth: 2 }}
              {...chartAnimation}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
