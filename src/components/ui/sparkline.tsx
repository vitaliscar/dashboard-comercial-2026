import { memo } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  data: number[];
  tone?: "success" | "warning" | "danger" | "primary" | "muted";
  height?: number;
  className?: string;
}

const TONE_VAR: Record<NonNullable<SparklineProps["tone"]>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  primary: "var(--color-primary)",
  muted: "var(--color-muted-foreground)",
};

/**
 * Mini-chart sin ejes/grid/tooltip para densidad de datos (KpiCard, filas de
 * tabla). Puro data-ink: solo la línea. Ver docs/MASTER_STRATEGY.md §3.2 (D1).
 */
export const Sparkline = memo(function Sparkline({
  data,
  tone = "primary",
  height = 32,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <div className={cn("flex items-center", className)} style={{ height }} />;
  }

  const chartData = data.map((valor, i) => ({ i, valor }));
  const min = Math.min(...data);
  const max = Math.max(...data);
  // Da un poco de aire arriba/abajo para que la línea no toque los bordes cuando
  // la serie es plana o casi plana.
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[min - pad, max + pad]} hide />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={TONE_VAR[tone]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
