import { memo, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartAnimation } from "@/hooks/use-chart-animation";

export type CompanyMonthlyRow = {
  mes: string;
  ccv: number;
  xibi: number;
  estrategicas: number;
};

type Props = {
  data: CompanyMonthlyRow[];
  title?: string;
  /** Meses (abreviados, ej. "Jul") a resaltar — el resto se atenúa. */
  highlightMonths?: string[];
};

// Mismo orden/color que UnitDonut para "Facturación por Compañía" en esta
// misma página (Consorcio Venequip / Xibi / Estratégicas → calm-1/2/3).
const COMPANY_COLORS: Record<string, string> = {
  ccv: "var(--color-chart-calm-1)",
  xibi: "var(--color-chart-calm-2)",
  estrategicas: "var(--color-chart-calm-3)",
};

const COMPANY_LABELS: Record<string, string> = {
  ccv: "Consorcio Venequip",
  xibi: "Xibi",
  estrategicas: "Estratégicas",
};

interface CustomDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { mes: string };
  stroke?: string;
}

function renderCustomDot(
  props: CustomDotProps,
  highlightMonths: string[] | undefined,
  totalPoints: number,
) {
  const { cx, cy, index, payload, stroke } = props;
  if (cx == null || cy == null) return <circle key="dot-empty" cx={0} cy={0} r={0} />;

  const mes = payload?.mes;
  const hasHighlight = Boolean(highlightMonths && highlightMonths.length > 0);
  const isHighlighted = hasHighlight ? Boolean(mes && highlightMonths!.includes(mes)) : true;
  const isLastPoint = index === totalPoints - 1;
  const isEmphasized = isHighlighted || isLastPoint;

  const r = hasHighlight ? (isEmphasized ? 6 : 3) : isLastPoint ? 5 : 4;
  const opacity = isEmphasized ? 1 : 0.35;
  const color = stroke || "currentColor";

  return (
    <circle
      key={`dot-${index}`}
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

/**
 * Líneas apiladas (stackId compartido) por compañía — muestra el total
 * mensual (altura acumulada) y la composición CCV/Xibi/Estratégicas a la vez,
 * sin duplicar el donut de "Facturación por Compañía" que ya está arriba (ese
 * es el agregado anual; esto es la evolución mes a mes).
 */
export const CompanyMonthlyStackedLines = memo(function CompanyMonthlyStackedLines({
  data,
  title = "Ventas Mensuales por Compañía",
  highlightMonths,
}: Props) {
  const chartAnimation = useChartAnimation();
  const renderDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, highlightMonths, data.length),
    [highlightMonths, data.length],
  );

  const hasData = data.some((row) => row.ccv > 0 || row.xibi > 0 || row.estrategicas > 0);

  return (
    <Card className="ring-0 card-elevated h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!hasData ? (
          <div className="flex h-[280px] flex-1 items-center justify-center text-xs text-muted-foreground">
            Sin datos por compañía
          </div>
        ) : (
          <div className="min-h-[280px] w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                <Tooltip
                  formatter={((v: unknown, name: string) => [money(Number(v)), name]) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                {(Object.keys(COMPANY_COLORS) as (keyof typeof COMPANY_COLORS)[]).map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={COMPANY_LABELS[key]}
                    stackId="companias"
                    stroke={COMPANY_COLORS[key]}
                    fill={COMPANY_COLORS[key]}
                    fillOpacity={0.15}
                    strokeWidth={2.5}
                    dot={renderDot}
                    {...chartAnimation}
                  >
                    <LabelList
                      dataKey={key}
                      position="top"
                      fontSize={9}
                      fontWeight={700}
                      fill={COMPANY_COLORS[key]}
                      formatter={((v: unknown) => money(Number(v))) as never}
                    />
                  </Area>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
