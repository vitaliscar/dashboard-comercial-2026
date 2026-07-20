import { memo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis } from "recharts";
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

export type EquiposAlquilerRow = {
  mes: string;
  equiposVenta: number;
  alquilerVenta: number;
  presupuestoTotal: number;
};

const chartConfig = {
  equiposVenta: { label: "Equipos", color: "var(--color-chart-calm-1)" },
  alquilerVenta: { label: "Alquiler", color: "var(--color-chart-calm-4)" },
  presupuestoTotal: { label: "Presupuesto (combinado)", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

export const EquiposAlquilerStacked = memo(function EquiposAlquilerStacked({
  data,
}: {
  data: EquiposAlquilerRow[];
}) {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Ventas Equipos / Alquiler</CardTitle>
        <CardDescription>Venta apilada vs presupuesto combinado</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <ComposedChart data={data}>
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
            <Bar
              dataKey="equiposVenta"
              name="Equipos"
              stackId="venta"
              fill="var(--color-equiposVenta)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="alquilerVenta"
              name="Alquiler"
              stackId="venta"
              fill="var(--color-alquilerVenta)"
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="presupuestoTotal"
              name="Presupuesto (combinado)"
              stroke="var(--color-presupuestoTotal)"
              strokeDasharray="5 3"
              strokeWidth={2.5}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
