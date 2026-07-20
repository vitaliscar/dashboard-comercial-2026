import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { TrendingDown, TrendingUp, HelpCircle, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "ochre";
  icon?: LucideIcon;
  trend?: { value: number; positive?: boolean };
  trendTone?: "success" | "warning" | "danger";
  compact?: boolean;
  featured?: boolean;
  subvalue?: string;
  subvalueLabel?: string;
  subvalueAlign?: "inline" | "below";
  tooltip?: string;
  progress?: number;
  /** Serie histórica (p. ej. últimos 6-12 meses) para el mini-chart de tendencia. */
  sparklineData?: number[];
  className?: string;
  valueClassName?: string;
  subvalueClassName?: string;
  subvalueLabelClassName?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  accent = "primary",
  icon: Icon,
  trend,
  trendTone,
  compact = false,
  featured = false,
  subvalue,
  subvalueLabel,
  subvalueAlign = "below",
  tooltip,
  progress,
  sparklineData,
  className,
  valueClassName,
  subvalueClassName,
  subvalueLabelClassName,
}: KpiCardProps) {
  const computedTrendTone = trendTone ?? (trend?.positive ? "success" : "danger");
  const sparklineTone =
    accent === "success" || accent === "danger" || accent === "warning" ? accent : "primary";

  return (
    <div
      className={cn(
        "relative p-6 overflow-hidden",
        featured
          ? "card-elevated-2 hover:card-elevated-2-hover"
          : "card-elevated hover:card-elevated-hover",
        "transition-all duration-200",
        "section-enter",
        className,
      )}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-[10px] font-bold tracking-[0.1em] text-muted-foreground">
            {label}
          </span>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  className="text-muted-foreground/60 hover:text-foreground transition-colors cursor-help p-0.5 rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Explicación de ${label}`}
                >
                  <HelpCircle className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-[11px] leading-normal font-sans">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {Icon && (
          <Icon
            className={cn(
              "size-4 shrink-0",
              accent === "success"
                ? "text-success"
                : accent === "danger"
                  ? "text-danger"
                  : accent === "warning"
                    ? "text-warning"
                    : accent === "ochre"
                      ? "text-ochre"
                      : "text-muted-foreground",
            )}
          />
        )}
      </div>

      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-2">
        <span
          className={cn(
            "font-display font-black tracking-tight tabular-nums text-foreground leading-none",
            compact ? "text-xl" : featured ? "text-3xl" : "text-2xl",
            valueClassName,
          )}
        >
          {value}
        </span>
        {subvalue && subvalueAlign === "inline" && (
          <span className={cn("font-bold tabular-nums text-sm align-baseline", subvalueClassName)}>
            {subvalue}
            {subvalueLabel && (
              <span
                className={cn(
                  "text-muted-foreground text-[10px] font-display font-bold tracking-wide ml-1.5",
                  subvalueLabelClassName,
                )}
              >
                {subvalueLabel}
              </span>
            )}
          </span>
        )}
      </div>

      {sparklineData && sparklineData.length >= 2 && (
        <Sparkline data={sparklineData} tone={sparklineTone} height={28} className="mb-2" />
      )}

      {subvalue && subvalueAlign === "below" && (
        <div className="flex items-baseline gap-1.5 mb-2">
          <span
            className={cn("font-bold tabular-nums text-foreground text-base", subvalueClassName)}
          >
            {subvalue}
          </span>
          {subvalueLabel && (
            <span
              className={cn(
                "text-muted-foreground text-[10px] font-display font-bold tracking-wide",
                subvalueLabelClassName,
              )}
            >
              {subvalueLabel}
            </span>
          )}
        </div>
      )}

      {progress !== undefined && (
        <div className="mt-3 progress-track h-1.5 w-full">
          <div
            className={cn(
              "progress-fill h-full rounded-full",
              accent === "success"
                ? "bg-success"
                : accent === "danger"
                  ? "bg-danger"
                  : accent === "warning"
                    ? "bg-warning"
                    : accent === "ochre"
                      ? "bg-ochre"
                      : "bg-primary",
            )}
            style={{ transform: `scaleX(${Math.min(Math.max(progress, 0), 100) / 100})` }}
          />
        </div>
      )}

      {(hint || trend) && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-foreground/5">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded",
                computedTrendTone === "success"
                  ? "bg-success/10 text-success"
                  : computedTrendTone === "warning"
                    ? "bg-warning/10 text-warning"
                    : "bg-danger/10 text-danger",
              )}
            >
              {trend.positive ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {Math.abs(trend.value).toFixed(1)}%
            </span>
          )}
          {hint && (
            <span className="text-[10px] font-display font-semibold text-muted-foreground">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
