import { memo } from "react";
import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";
import { money } from "@/lib/format";
import { statusFromPct90 } from "@/lib/format";
import { GoalFeedback } from "./GoalFeedback";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useChartAnimation } from "@/hooks/use-chart-animation";

const chartConfig = {
  value: { label: "Cumplimiento" },
} satisfies ChartConfig;

type Props = {
  pct: number;
  facturado: number;
  presupuesto: number;
  title?: string;
};

const ACCENT_VAR: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

export const ComplianceGauge = memo(function ComplianceGauge({
  pct,
  facturado,
  presupuesto,
  title = "Cumplimiento General",
}: Props) {
  const chartAnimation = useChartAnimation();
  const displayPct = Math.max(0, pct);
  const color = ACCENT_VAR[statusFromPct90(pct)];
  const brecha = presupuesto - facturado;

  return (
    <Card className="ring-0 card-elevated flex flex-col items-center border-l-2 border-l-primary">
      <CardHeader className="w-full text-center pb-2">
        <CardTitle className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="relative size-36">
          <ChartContainer config={chartConfig} className="aspect-auto size-36">
            <RadialBarChart
              innerRadius="78%"
              outerRadius="100%"
              data={[{ value: Math.min(100, displayPct) }]}
              startAngle={225}
              endAngle={-45}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={8}
                fill={color}
                background={{ fill: "oklch(0.22 0.01 255)" }}
                {...chartAnimation}
              />
            </RadialBarChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="font-mono text-2xl font-bold tracking-tight"
              style={{ color }}
            >
              {displayPct.toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="mt-3 text-center">
          <div className="font-mono text-base font-bold text-foreground">
            {money(facturado)}{" "}
            <span className="text-xs font-medium text-muted-foreground">
              / {money(presupuesto)}
            </span>
          </div>
          <div className="mt-3">
            <GoalFeedback pct={pct} brecha={brecha} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
