import { memo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { abbreviateSucursal, money, statusFromPct90 } from "@/lib/format";
import type { BranchSummaryRow } from "./BranchSummaryTable";

export type BranchRow = BranchSummaryRow;

const ACCENT_VAR: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <i className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function getAxisConfig(maxPct: number) {
  if (maxPct <= 110) {
    return {
      domain: [0, 110] as [number, number],
      ticks: [0, 50, 100, 110],
    };
  }
  const domainMax = Math.ceil(maxPct / 10) * 10;
  const ticks = [];
  for (let i = 0; i <= domainMax; i += 50) {
    ticks.push(i);
  }
  if (ticks[ticks.length - 1] !== domainMax) {
    ticks.push(domainMax);
  }
  return {
    domain: [0, domainMax] as [number, number],
    ticks,
  };
}

export const BranchRanking = memo(function BranchRanking({ rows }: { rows: BranchRow[] }) {
  const chartData = rows.map((r) => ({
    ...r,
    shortLabel: abbreviateSucursal(r.label),
    labelText: `${r.pct.toFixed(1)}%  ·  ${money(r.facturado)}`,
  }));

  const maxPct = Math.max(...rows.map((r) => r.pct), 0);
  const { domain, ticks } = getAxisConfig(maxPct);

  return (
    <div className="card-elevated section-enter flex h-full flex-col p-4">
      <h3 className="font-display text-sm font-semibold">Cumplimiento por sucursal</h3>
      <div className="mt-1 mb-3 flex flex-wrap justify-center gap-3 text-[10px] text-muted-foreground">
        <LegendDot color={ACCENT_VAR.success} label="Meta (90%+)" />
        <LegendDot color={ACCENT_VAR.warning} label="Aceptable (70-89%)" />
        <LegendDot color={ACCENT_VAR.danger} label="Atención (<70%)" />
      </div>
      <div className="flex-1" style={{ minHeight: Math.max(260, chartData.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 40, left: 0, bottom: 5 }}
          >
            <XAxis
              type="number"
              domain={domain}
              ticks={ticks}
              stroke="var(--color-muted-foreground)"
              fontSize={10}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="shortLabel"
              stroke="var(--color-muted-foreground)"
              fontSize={10}
              width={38}
            />
            <Tooltip
              formatter={
                ((v: unknown, _: unknown, item: unknown) => {
                  const payload = item as { payload?: { facturado: number } };
                  const monto = money(payload?.payload?.facturado ?? 0);
                  return `${Number(v).toFixed(1)}%  ·  ${monto}`;
                }) as never
              }
              labelFormatter={
                ((_: unknown, payload: unknown) => {
                  const p = payload as Array<{ payload: { label: string } }>;
                  return p?.[0]?.payload.label ?? "";
                }) as never
              }
              contentStyle={{
                background: "var(--color-card)",
                border: "2px solid var(--color-foreground)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="pct"
              name="Cumplimiento"
              radius={[0, 4, 4, 0]}
              barSize={24}
              label={{
                dataKey: "labelText",
                position: "right",
                fontSize: 9,
                fontWeight: 700,
                fill: "var(--color-foreground)",
              }}
            >
              {chartData.map((row) => (
                <Cell key={row.id} fill={ACCENT_VAR[statusFromPct90(row.pct)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
