import { memo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CsaTrendRow = {
  mes: string;
  monto: number;
};

type Props = {
  data: CsaTrendRow[];
  title?: string;
  selectedMonths?: string[];
};

import { useChartAnimation } from "@/hooks/use-chart-animation";

export const CsaTrendChart = memo(function CsaTrendChart({
  data,
  title = "Tendencia Ventas CSA",
  selectedMonths,
}: Props) {
  const chartAnimation = useChartAnimation();
  const hasSelection = Boolean(selectedMonths && selectedMonths.length > 0);

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin datos de CSA
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip
                  formatter={((v: unknown) => [money(Number(v)), "Ventas CSA"]) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" name="Ventas CSA" radius={[4, 4, 0, 0]} {...chartAnimation}>
                  {data.map((row) => {
                    const isSelected = hasSelection ? selectedMonths!.includes(row.mes) : true;
                    return (
                      <Cell
                        key={row.mes}
                        fill="var(--color-warning)"
                        fillOpacity={isSelected ? 1 : 0.35}
                      />
                    );
                  })}
                  <LabelList
                    dataKey="monto"
                    position="top"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                    formatter={((v: unknown) => money(Number(v))) as never}
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
