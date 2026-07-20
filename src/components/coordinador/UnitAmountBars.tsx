import { memo } from "react";
import { BarChart, Bar, LabelList, XAxis, YAxis } from "recharts";
import { money, pct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type UnitAmountRow = { label: string; facturado: number; cumplimiento: number };

const chartConfig = {
  facturado: { label: "Facturado", color: "var(--color-chart-calm-1)" },
} satisfies ChartConfig;

export const UnitAmountBars = memo(function UnitAmountBars({ data }: { data: UnitAmountRow[] }) {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Ventas Por Unidad de Negocios</CardTitle>
        <CardDescription>Monto total por unidad</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data}>
            <XAxis
              dataKey="label"
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
            <Bar dataKey="facturado" fill="var(--color-facturado)" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="facturado"
                position="top"
                fontSize={11}
                fontWeight={700}
                fill="var(--color-foreground)"
                formatter={((v: unknown) => money(Number(v))) as never}
              />
              <LabelList
                dataKey="cumplimiento"
                position="insideBottom"
                offset={6}
                fontSize={10}
                fontWeight={700}
                fill="var(--color-primary-foreground)"
                formatter={((v: unknown) => pct(Number(v))) as never}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
