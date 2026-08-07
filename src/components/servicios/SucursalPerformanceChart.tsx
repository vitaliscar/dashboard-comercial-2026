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
import { money, pct, statusFromPct90 } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SucursalPerformanceRow = {
  nombre: string;
  monto: number;
  presupuesto: number;
  pctCumplimiento: number;
};

type Props = {
  data: SucursalPerformanceRow[];
  title?: string;
};

const STATUS_COLOR: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

const STATUS_LABEL: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "Meta cumplida (90%+)",
  warning: "Aceptable (70–89%)",
  danger: "Atención (<70%)",
};

/**
 * Reemplaza 4 vistas redundantes que mostraban la misma facturación por
 * sucursal (bar simple, donut de participación, combo venta/presupuesto y
 * pirámide de % cumplimiento) por una sola: venta por sucursal, color por
 * estado de cumplimiento, con el % y el presupuesto en el tooltip/label.
 */
import { useChartAnimation } from "@/hooks/use-chart-animation";

export const SucursalPerformanceChart = memo(function SucursalPerformanceChart({
  data,
  title = "Venta y cumplimiento por sucursal",
}: Props) {
  const chartAnimation = useChartAnimation();
  const sorted = [...data].sort((a, b) => b.pctCumplimiento - a.pctCumplimiento);

  return (
    <Card className="ring-0 card-elevated h-full">
      <CardHeader>
        <CardTitle className="font-display font-semibold">{title}</CardTitle>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1">
          {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
            <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: STATUS_COLOR[status] }}
              />
              {STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {sorted.length === 0 ? (
          <div className="flex h-[280px] flex-1 items-center justify-center text-xs text-muted-foreground">
            Sin datos de sucursales
          </div>
        ) : (
          <div className="min-h-[280px] w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted}
                layout="vertical"
                margin={{ top: 10, right: 60, left: 10, bottom: 0 }}
              >
                <XAxis type="number" tick={false} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="nombre"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={110}
                />
                <Tooltip
                  formatter={
                    ((_v: unknown, _n: string, item: { payload: SucursalPerformanceRow }) => [
                      `${money(item.payload.monto)} / ${money(item.payload.presupuesto)} (${pct(item.payload.pctCumplimiento)})`,
                      "Venta / Presupuesto",
                    ]) as never
                  }
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" radius={[0, 4, 4, 0]} {...chartAnimation}>
                  {sorted.map((row) => (
                    <Cell
                      key={row.nombre}
                      fill={STATUS_COLOR[statusFromPct90(row.pctCumplimiento)]}
                    />
                  ))}
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
