import { memo } from "react";
import { LineChart, Line, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type CompanyTrendRow = { mes: string; ccv: number; xibi: number; estrategicas: number };

const chartConfig = {
  ccv: { label: "CCV", color: "var(--color-chart-calm-1)" },
  xibi: { label: "Xibi", color: "var(--color-chart-calm-2)" },
  estrategicas: { label: "Ventas Estratégicas", color: "var(--color-chart-calm-3)" },
} satisfies ChartConfig;

export const CompanyTrendChart = memo(function CompanyTrendChart({
  data,
}: {
  data: CompanyTrendRow[];
}) {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Ventas Mensuales por Compañía</CardTitle>
        <CardDescription>Enero - Junio</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <LineChart data={data}>
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
              dataKey="ccv"
              name="CCV"
              stroke="var(--color-ccv)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="xibi"
              name="Xibi"
              stroke="var(--color-xibi)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="estrategicas"
              name="Ventas Estratégicas"
              stroke="var(--color-estrategicas)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
