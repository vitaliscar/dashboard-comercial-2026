import { memo, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartAnimation } from "@/hooks/use-chart-animation";

export type MonthlyMarcaRow = {
  mes: string;
  Chronus: number;
  Donaldson: number;
  DonaldsonIndustrial: number;
  OtraMarca: number;
};

type Props = {
  data: MonthlyMarcaRow[];
  title?: string;
  /** Meses (abreviados, ej. "Jul") a resaltar — el resto se atenúa. */
  highlightMonths?: string[];
};

const MARCA_COLORS: Record<string, string> = {
  Chronus: "var(--color-chart-calm-1)",
  Donaldson: "var(--color-chart-calm-2)",
  DonaldsonIndustrial: "var(--color-chart-calm-3)",
  OtraMarca: "var(--color-chart-calm-4)",
};

const MARCA_LABELS: Record<string, string> = {
  Chronus: "Chronus",
  Donaldson: "Donaldson",
  DonaldsonIndustrial: "Donaldson Industrial",
  OtraMarca: "Otra Marca",
};

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { mes: string };
  stroke?: string;
}

function renderCustomDot(props: CustomDotProps, highlightMonths?: string[]) {
  const { cx, cy, payload, stroke } = props;
  if (cx == null || cy == null) return <circle key="dot-empty" cx={0} cy={0} r={0} />;

  const mes = payload?.mes;
  const hasHighlight = Boolean(highlightMonths && highlightMonths.length > 0);
  const isHighlighted = hasHighlight ? Boolean(mes && highlightMonths!.includes(mes)) : true;

  const r = hasHighlight ? (isHighlighted ? 6 : 3) : 4;
  const opacity = isHighlighted ? 1 : 0.35;
  const color = stroke || "currentColor";

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      stroke={color}
      fillOpacity={opacity}
      strokeOpacity={opacity}
    />
  );
}

export const MarcasMonthlyChart = memo(function MarcasMonthlyChart({
  data,
  title = "Ventas por Marca (Chronus / Donaldson)",
  highlightMonths,
}: Props) {
  const chartAnimation = useChartAnimation();
  const renderDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, highlightMonths),
    [highlightMonths],
  );

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin datos por marca
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip
                  formatter={((v: unknown, name: string) => [money(Number(v)), name]) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                {(Object.keys(MARCA_COLORS) as (keyof typeof MARCA_COLORS)[]).map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={MARCA_LABELS[key]}
                    stroke={MARCA_COLORS[key]}
                    strokeWidth={2.5}
                    dot={renderDot}
                    {...chartAnimation}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
