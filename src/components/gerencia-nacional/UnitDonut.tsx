import { memo, useMemo } from "react";
import { PieChart, Pie, Cell } from "recharts";
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

const DONUT_COLOR_VARS = [
  "var(--color-chart-calm-1)",
  "var(--color-chart-calm-2)",
  "var(--color-chart-calm-3)",
  "var(--color-chart-calm-4)",
  "var(--color-chart-calm-5)",
];

const RADIAN = Math.PI / 180;

type PieLabelProps = {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
};

function renderSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelProps) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="var(--color-foreground)"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

type Props = {
  /** `id` is only needed by callers that support selection dimming (e.g. business-unit chips). */
  data: { id?: string; label: string; facturado: number }[];
  title?: string;
  /** Unit IDs selected via the top unit-filter chips; others dim without being removed. */
  selectedIds?: string[];
};

export const UnitDonut = memo(function UnitDonut({
  data,
  title = "De dónde vino la venta",
  selectedIds = [],
}: Props) {
  const chartConfig = useMemo(
    () =>
      data.reduce<ChartConfig>((config, row, i) => {
        config[row.label] = {
          label: row.label,
          color: DONUT_COLOR_VARS[i % DONUT_COLOR_VARS.length],
        };
        return config;
      }, {}),
    [data],
  );

  return (
    <Card className="ring-0 card-elevated flex h-full flex-col">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center">
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <PieChart margin={{ top: 0, right: 0, bottom: 24, left: 0 }}>
            <Pie
              data={data}
              dataKey="facturado"
              nameKey="label"
              cy="45%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              label={renderSliceLabel as never}
              labelLine={false}
            >
              {data.map((row, i) => {
                const isSelected =
                  selectedIds.length === 0 || (!!row.id && selectedIds.includes(row.id));
                return (
                  <Cell
                    key={row.id ?? row.label}
                    fill={DONUT_COLOR_VARS[i % DONUT_COLOR_VARS.length]}
                    fillOpacity={isSelected ? 1 : 0.3}
                    stroke={
                      isSelected && selectedIds.length > 0 ? "var(--color-foreground)" : undefined
                    }
                    strokeWidth={isSelected && selectedIds.length > 0 ? 2 : 0}
                  />
                );
              })}
            </Pie>
            <ChartTooltip
              content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
            />
            <ChartLegend content={<ChartLegendContent nameKey="label" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
