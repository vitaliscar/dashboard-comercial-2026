import { memo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MonthlyWorkshopRow = {
  mes: string;
  CRM: number;
  CNRC: number;
  VMS: number;
  [key: string]: string | number;
};

type Props = {
  data: MonthlyWorkshopRow[];
  title?: string;
};

const WORKSHOP_COLORS: Record<string, string> = {
  CRM: "var(--color-chart-calm-1)",
  CNRC: "var(--color-chart-calm-2)",
  VMS: "var(--color-chart-calm-3)",
};

export const TalleresMonthlyChart = memo(function TalleresMonthlyChart({
  data,
  title = "Ventas por Taller y Mes (CRM / CNRC / VMS)",
}: Props) {
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
              <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="CRM" name="CRM" fill={WORKSHOP_COLORS.CRM} radius={[4, 4, 0, 0]} />
                <Bar dataKey="CNRC" name="CNRC" fill={WORKSHOP_COLORS.CNRC} radius={[4, 4, 0, 0]} />
                <Bar dataKey="VMS" name="VMS (Machine Shop)" fill={WORKSHOP_COLORS.VMS} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
