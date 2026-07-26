import { memo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
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
};

export const CsaTrendChart = memo(function CsaTrendChart({
  data,
  title = "Tendencia Ventas CSA",
}: Props) {
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
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="csaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-warning)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
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
                <Area
                  type="monotone"
                  dataKey="monto"
                  name="Ventas CSA"
                  stroke="var(--color-warning)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#csaGradient)"
                  dot={{ r: 4, fill: "var(--color-warning)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
