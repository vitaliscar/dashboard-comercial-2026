import { memo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RankedRow = { label: string; value: number; pct?: number };

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

const CHART_HEIGHT = 280;

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
      {/* Altura explícita en el contenedor del chart (no h-full): la tarjeta
          puede usarse fuera de un grid que la estire, y ahí h-full resuelve a 0
          y Recharts no dibuja nada ("width(-1) and height(-1)"). */}
      <CardContent className="flex-1 min-h-[260px]">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="w-full min-w-0" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart
                data={sorted}
                layout="vertical"
                margin={{ top: 10, right: 90, left: 10, bottom: 0 }}
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
                  formatter={
                    ((_v: unknown, _n: string, item: { payload: RankedRow }) => [
                      item.payload.pct !== undefined
                        ? `${valueFormatter(item.payload.value)} · ${item.payload.pct.toFixed(1)}%`
                        : valueFormatter(item.payload.value),
                      "",
                    ]) as never
                  }
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={barColor}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    content={
                      ((props: {
                        x?: number;
                        y?: number;
                        width?: number;
                        height?: number;
                        index?: number;
                      }) => {
                        const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props;
                        const row = sorted[index];
                        if (!row) return null;
                        const text =
                          row.pct !== undefined
                            ? `${valueFormatter(row.value)} · ${row.pct.toFixed(1)}%`
                            : valueFormatter(row.value);
                        return (
                          <text
                            x={x + width + 6}
                            y={y + height / 2}
                            dy={3}
                            fontSize={10}
                            fontWeight={700}
                            fill="var(--color-foreground)"
                          >
                            {text}
                          </text>
                        );
                      }) as never
                    }
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
