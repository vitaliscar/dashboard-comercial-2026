import { memo } from "react";
import { money, statusFromPct90 } from "@/lib/format";
import { GoalFeedback } from "./GoalFeedback";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Props = {
  pct: number;
  facturado: number;
  presupuesto: number;
  title?: string;
  subtitle?: string;
  projection?: { value: number; tone: "success" | "warning" | "danger" };
};

const STATUS_LABEL: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "Meta alcanzada",
  warning: "Cerca de la meta",
  danger: "Requiere atención",
};
const PROJECTION_CLASS = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export const ComplianceGauge = memo(function ComplianceGauge({
  pct,
  facturado,
  presupuesto,
  title = "Cumplimiento General",
  subtitle,
  projection,
}: Props) {
  const value = Number.isFinite(pct) ? pct : 0;
  const color = `var(--color-${statusFromPct90(value)})`;
  const brecha = presupuesto - facturado;
  const progressWidth = Math.min(100, Math.max(0, value));

  return (
    <Card className="card-elevated flex h-full min-w-0 flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
            {value.toFixed(1)}%
          </strong>
          <span className="text-xs font-medium text-muted-foreground">{STATUS_LABEL[statusFromPct90(value)]}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${title}: ${STATUS_LABEL[statusFromPct90(value)]}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressWidth}
          aria-valuetext={`${value.toFixed(1)}% de cumplimiento`}
        >
          <span className="block h-full rounded-full transition-[width]" style={{ width: `${progressWidth}%`, backgroundColor: color }} />
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Facturado</dt>
            <dd className="mt-1 font-mono font-semibold tabular-nums text-foreground">{money(facturado)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Presupuesto</dt>
            <dd className="mt-1 font-mono font-semibold tabular-nums text-foreground">{money(presupuesto)}</dd>
          </div>
        </dl>
        {projection && (
          <p className={`font-mono text-xs font-semibold tabular-nums ${PROJECTION_CLASS[projection.tone]}`}>
            Proyección de cierre: {money(projection.value)}
          </p>
        )}
        <GoalFeedback pct={value} brecha={brecha} />
      </CardContent>
    </Card>
  );
});
