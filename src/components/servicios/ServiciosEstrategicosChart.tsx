import { memo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type StrategicServiceRow = {
  tipoServicio: string;
  monto: number;
};

type Props = {
  data: StrategicServiceRow[];
  title?: string;
};

export const ServiciosEstrategicosChart = memo(function ServiciosEstrategicosChart({
  data,
  title = "Tipo Servicio Estratégico",
}: Props) {
  const sorted = [...data].sort((a, b) => b.monto - a.monto);

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin datos estratégicos
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sorted} layout="vertical" margin={{ top: 10, right: 35, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => money(v)} />
                <YAxis
                  dataKey="tipoServicio"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={110}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" fill="var(--color-chart-calm-2)" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="monto"
                    position="right"
                    fontSize={10}
                    fontWeight={600}
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
