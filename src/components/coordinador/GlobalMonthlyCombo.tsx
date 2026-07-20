import { memo } from "react";
import { ComposedChart, Bar, Line, LabelList, XAxis, YAxis } from "recharts";
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

export type MonthlyRow = { mes: string; presupuesto: number; venta: number };

const chartConfig = {
  venta: { label: "Venta Total", color: "var(--color-chart-calm-1)" },
  presupuesto: { label: "Presupuesto", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

export const GlobalMonthlyCombo = memo(function GlobalMonthlyCombo({
  data,
}: {
  data: MonthlyRow[];
}) {
  const chartData = data.map((row) => {
    const cumplimiento = row.presupuesto > 0 ? (row.venta / row.presupuesto) * 100 : 0;
    return { ...row, cumplimiento };
  });

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">
          Presupuesto vs Cumplimiento Mensual Global
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
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
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="venta" name="Venta Total" fill="var(--color-venta)" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="venta"
                position="top"
                fontSize={10}
                fontWeight={700}
                fill="var(--color-foreground)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
              <LabelList
                dataKey="cumplimiento"
                position="insideBottom"
                offset={8}
                fontSize={10}
                fontWeight={700}
                fill="var(--color-foreground)"
                formatter={((v: unknown) => `${Number(v).toFixed(0)}%`) as never}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="presupuesto"
              name="Presupuesto"
              stroke="var(--color-presupuesto)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "var(--color-card)", strokeWidth: 2 }}
            >
              <LabelList
                dataKey="presupuesto"
                position="top"
                offset={10}
                fontSize={10}
                fontWeight={700}
                fill="var(--color-muted-foreground)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
            </Line>
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
