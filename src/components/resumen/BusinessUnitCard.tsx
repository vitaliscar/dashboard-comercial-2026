import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type InfoColor = "success" | "warning" | "danger" | "muted" | "default";

interface AdditionalInfo {
  label: string;
  value: string | number;
  color?: InfoColor;
  progress?: number;
}

interface BusinessUnitCardProps {
  label: string;
  monto: number;
  porcentaje: number;
  presupuesto?: number;
  additionalInfo?: AdditionalInfo[];
}

const textColors: Record<InfoColor, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
  default: "text-foreground",
};

const barColors: Record<InfoColor, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-muted-foreground/50",
  default: "bg-primary",
};

export function BusinessUnitCard({
  label,
  monto,
  porcentaje,
  presupuesto,
  additionalInfo = [],
}: BusinessUnitCardProps) {
  return (
    <Card className="ring-0 card-elevated hover:card-elevated-hover section-enter" size="sm">
      <CardContent className="flex flex-col gap-3">
        {/* Header: unit name + presupuesto (meta) or participation % */}
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground truncate">
            {label}
          </h3>
          <span
            className={cn(
              "text-xs tabular-nums shrink-0",
              presupuesto !== undefined
                ? "font-bold text-foreground"
                : "font-medium text-muted-foreground",
            )}
          >
            {presupuesto !== undefined ? money(presupuesto) : `${porcentaje.toFixed(1)}%`}
          </span>
        </div>

        {/* Primary value */}
        <div>
          <p className="font-display text-xl font-bold text-foreground tabular-nums leading-tight">
            {money(monto)}
          </p>
        </div>

        {/* Additional metrics with optional progress bars */}
        {additionalInfo.map((info, idx) => {
          const color: InfoColor = info.color ?? "default";
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-muted-foreground">{info.label}</p>
                <p className={cn("text-xs font-semibold tabular-nums shrink-0", textColors[color])}>
                  {info.value}
                </p>
              </div>
              {info.progress !== undefined && (
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={info.label}
                  aria-valuenow={Math.round(Math.min(Math.max(info.progress, 0), 150))}
                  aria-valuemin={0}
                  aria-valuemax={150}
                >
                  <div
                    className={cn("progress-fill", barColors[color])}
                    style={{
                      transform: `scaleX(${Math.min(Math.max(info.progress, 0), 150) / 100})`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
