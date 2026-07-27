import { memo, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MonthlyWorkshopRow = {
  mes: string;
  CRM: number;
  CNRC: number;
  MachineShop: number;
  [key: string]: string | number;
};

type Props = {
  data: MonthlyWorkshopRow[];
  title?: string;
  selectedMonths?: string[];
};

const WORKSHOP_COLORS: Record<string, string> = {
  CRM: "var(--color-chart-calm-1)",
  CNRC: "var(--color-chart-calm-2)",
  MachineShop: "var(--color-chart-calm-3)",
};

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { mes: string };
  stroke?: string;
}

function renderCustomDot(props: CustomDotProps, selectedMonths?: string[]) {
  const { cx, cy, payload, stroke } = props;
  if (cx == null || cy == null) return <circle key="dot-empty" cx={0} cy={0} r={0} />;

  const mes = payload?.mes;
  const hasSelection = Boolean(selectedMonths && selectedMonths.length > 0);
  const isSelected = hasSelection ? Boolean(mes && selectedMonths!.includes(mes)) : true;

  const r = hasSelection ? (isSelected ? 6 : 3) : 4;
  const opacity = isSelected ? 1 : 0.35;
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

import { useChartAnimation } from "@/hooks/use-chart-animation";

export const TalleresMonthlyChart = memo(function TalleresMonthlyChart({
  data,
  title = "Ventas por Taller y Mes (CRM / CNRC / Machine Shop)",
  selectedMonths,
}: Props) {
  const chartAnimation = useChartAnimation();
  const renderCrmDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
    [selectedMonths],
  );
  const renderCnrcDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
    [selectedMonths],
  );
  const renderMachineShopDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
    [selectedMonths],
  );

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin datos de talleres
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
                <Line
                  type="monotone"
                  dataKey="CRM"
                  name="CRM"
                  stroke={WORKSHOP_COLORS.CRM}
                  strokeWidth={2.5}
                  dot={renderCrmDot}
                  {...chartAnimation}
                />
                <Line
                  type="monotone"
                  dataKey="CNRC"
                  name="CNRC"
                  stroke={WORKSHOP_COLORS.CNRC}
                  strokeWidth={2.5}
                  dot={renderCnrcDot}
                  {...chartAnimation}
                />
                <Line
                  type="monotone"
                  dataKey="MachineShop"
                  name="Machine Shop"
                  stroke={WORKSHOP_COLORS.MachineShop}
                  strokeWidth={2.5}
                  dot={renderMachineShopDot}
                  {...chartAnimation}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
