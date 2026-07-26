import { memo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { pct, money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BranchComplianceRow = {
  nombre: string;
  presupuesto: number;
  venta: number;
  pctCumplimiento: number;
};

type Props = {
  data: BranchComplianceRow[];
  title?: string;
};

export const CompliancePyramid = memo(function CompliancePyramid({
  data,
  title = "Cumplimiento por Sucursal (Orden de Rango)",
}: Props) {
  const sorted = [...data].sort((a, b) => b.pctCumplimiento - a.pctCumplimiento);

  return (
    <Card className="ring-0 card-elevated flex flex-col h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[260px]">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin datos de sucursales
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sorted} layout="vertical" margin={{ top: 10, right: 45, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <YAxis
                  dataKey="nombre"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={110}
                />
                <Tooltip
                  formatter={((v: unknown, name: string, item: { payload: BranchComplianceRow }) => [
                    `${pct(Number(v))} (${money(item.payload.venta)} / ${money(item.payload.presupuesto)})`,
                    "% Cumplimiento",
                  ]) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="pctCumplimiento" fill="var(--color-primary)" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="pctCumplimiento"
                    position="right"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                    formatter={((v: unknown) => pct(Number(v))) as never}
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
