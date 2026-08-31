import { memo, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { money } from "@/lib/format";
import { createLastPointLabel } from "@/lib/chart-labels";
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
  index?: number;
  payload?: { mes: string };
  stroke?: string;
}

function renderCustomDot(
  props: CustomDotProps,
  selectedMonths: string[] | undefined,
  totalPoints: number,
) {
  const { cx, cy, index, payload, stroke } = props;
  if (cx == null || cy == null) return <circle key="dot-empty" cx={0} cy={0} r={0} />;

  const mes = payload?.mes;
  const hasSelection = Boolean(selectedMonths && selectedMonths.length > 0);
  const isSelected = hasSelection ? Boolean(mes && selectedMonths!.includes(mes)) : true;
  const isLastPoint = index === totalPoints - 1;
  const isEmphasized = isSelected || isLastPoint;

  const r = hasSelection ? (isEmphasized ? 6 : 3) : isLastPoint ? 5 : 4;
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

import { useChartAnimation } from "@/hooks/use-chart-animation";

export const TalleresMonthlyChart = memo(function TalleresMonthlyChart({
  data,
  title = "Ventas por Taller y Mes (CRM / CNRC / Machine Shop)",
  selectedMonths,
}: Props) {
  const chartAnimation = useChartAnimation();
  const renderCrmDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths, data.length),
    [selectedMonths, data.length],
  );
  const renderCnrcDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths, data.length),
    [selectedMonths, data.length],
  );
  const renderMachineShopDot = useCallback(
    (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths, data.length),
    [selectedMonths, data.length],
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
                <Line
                  type="monotone"
                  dataKey="CRM"
                  name="CRM"
                  stroke={WORKSHOP_COLORS.CRM}
                  strokeWidth={2.5}
                  dot={renderCrmDot}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="CRM"
                    content={createLastPointLabel(
                      data.length,
                      (v) => money(v),
                      WORKSHOP_COLORS.CRM,
                      0,
                    )}
                  />
                </Line>
                <Line
                  type="monotone"
                  dataKey="CNRC"
                  name="CNRC"
                  stroke={WORKSHOP_COLORS.CNRC}
                  strokeWidth={2.5}
                  dot={renderCnrcDot}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="CNRC"
                    content={createLastPointLabel(
                      data.length,
                      (v) => money(v),
                      WORKSHOP_COLORS.CNRC,
                      1,
                    )}
                  />
                </Line>
                <Line
                  type="monotone"
                  dataKey="MachineShop"
                  name="Machine Shop"
                  stroke={WORKSHOP_COLORS.MachineShop}
                  strokeWidth={2.5}
                  dot={renderMachineShopDot}
                  {...chartAnimation}
                >
                  <LabelList
                    dataKey="MachineShop"
                    content={createLastPointLabel(
                      data.length,
                      (v) => money(v),
                      WORKSHOP_COLORS.MachineShop,
                      2,
                    )}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
