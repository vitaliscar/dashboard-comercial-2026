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

// Los tonos "calm" (chart-calm-*) son translúcidos y dos de ellos comparten el
// mismo hue (155°, solo cambia la opacidad) — casi indistinguibles en un
// donut. Los chart-1..5 son opacos y con hues más separados entre sí.
const DONUT_COLOR_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-3)",
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

import { useChartAnimation } from "@/hooks/use-chart-animation";

type Props = {
  /** `id` is only needed by callers that support selection dimming (e.g. business-unit chips). */
  data: { id?: string; label: string; facturado: number }[];
  title?: string;
  /** Unit IDs selected via the top unit-filter chips; others dim without being removed. */
  selectedIds?: string[];
  /** Radio interno/externo de la dona como % del contenedor (no px — así
   * escala solo con el tamaño real del card y con el zoom del navegador,
   * en vez de quedar fijo y desbordarse o verse chico). El default calza
   * en cards angostas (2-3 por fila); subir el % cuando el card ocupa
   * medio ancho o más y sobra espacio vacío alrededor de la dona. */
  innerRadius?: string;
  outerRadius?: string;
};

export const UnitDonut = memo(function UnitDonut({
  data,
  title = "De dónde vino la venta",
  selectedIds = [],
  innerRadius = "31%",
  outerRadius = "56%",
}: Props) {
  const chartAnimation = useChartAnimation();
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
        {/* aspect-square (no altura fija en px): el radio de la dona se calcula
            como % de min(ancho, alto) del contenedor, así que con una altura
            fija (ej. h-80) la dona no crece aunque el card se haga más ancho
            (zoom out, grid con menos columnas). Con aspect-square el alto
            escala junto con el ancho real de la card en todo momento. */}
        <ChartContainer
          config={chartConfig}
          className="aspect-square w-full max-h-[420px] min-h-[220px]"
        >
          <PieChart margin={{ top: 0, right: 0, bottom: 24, left: 0 }}>
            <Pie
              data={data}
              dataKey="facturado"
              nameKey="label"
              cy="45%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              label={renderSliceLabel as never}
              labelLine={false}
              {...chartAnimation}
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
              content={
                <ChartTooltipContent
                  nameKey="label"
                  formatter={(value, name) => (
                    <div className="flex flex-1 items-center justify-between gap-3">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {money(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent nameKey="label" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
});
