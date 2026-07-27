import { memo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RankedRow = { label: string; value: number };

type Props = {
  data: RankedRow[];
  title: string;
  subtitle?: string;
  emptyLabel: string;
  valueFormatter: (value: number) => string;
  barColor?: string;
};

/**
 * Ranking horizontal genérico — mismo "job" (comparar magnitud entre pocas
 * categorías con nombres largos) usado por tipo de servicio y servicios
 * estratégicos. Un solo componente evita 3 copias casi idénticas del mismo
 * BarChart vertical con distintas props.
 */
import { useChartAnimation } from "@/hooks/use-chart-animation";

export const RankedHorizontalBar = memo(function RankedHorizontalBar({
  data,
  title,
  subtitle,
  emptyLabel,
  valueFormatter,
  barColor = "var(--color-chart-calm-2)",
}: Props) {
  const chartAnimation = useChartAnimation();
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="h-full min-h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted}
                layout="vertical"
                margin={{ top: 10, right: 45, left: 10, bottom: 0 }}
              >
                <XAxis type="number" tick={false} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="label"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={130}
                />
                <Tooltip
                  formatter={((v: unknown) => valueFormatter(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill={barColor} radius={[0, 4, 4, 0]} {...chartAnimation}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                    formatter={((v: unknown) => valueFormatter(Number(v))) as never}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
