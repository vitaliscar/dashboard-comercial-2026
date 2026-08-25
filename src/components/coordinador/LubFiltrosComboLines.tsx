import { memo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import { money } from "@/lib/format";
import type { MonthlyRow } from "./GlobalMonthlyCombo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  venta: { label: "Venta Total", color: "var(--color-chart-calm-1)" },
} satisfies ChartConfig;

export const LubFiltrosComboLines = memo(function LubFiltrosComboLines({
  data,
}: {
  data: MonthlyRow[];
}) {
  const chartAnimation = useChartAnimation();
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">
          Ventas Mensuales Lubricantes / Filtros
        </CardTitle>
        <CardDescription>Presupuesto vs venta total</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
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
            <Line
              type="monotone"
              dataKey="presupuesto"
              name="Presupuesto"
              stroke="var(--color-presupuesto)"
              strokeDasharray="5 3"
              strokeWidth={2.5}
              {...chartAnimation}
            >
              <LabelList
                dataKey="presupuesto"
                position="bottom"
                fontSize={9}
                fontWeight={700}
                fill="var(--color-presupuesto)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
            </Line>
            <Line
              type="monotone"
              dataKey="venta"
              name="Venta Total"
              stroke="var(--color-venta)"
              strokeWidth={2.5}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const { cx, cy, index } = props;
                if (index !== data.length - 1) return <></>;
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
                position="top"
                fontSize={9}
                fontWeight={700}
                fill="var(--color-venta)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
