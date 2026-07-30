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
  sparklineData?: number[];
  className?: string;
  valueClassName?: string;
  subvalueClassName?: string;
  subvalueLabelClassName?: string;
}

const ACCENT_BORDER: Record<string, string> = {
  primary: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  ochre: "border-l-ochre",
};

const ACCENT_TEXT: Record<string, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  ochre: "text-ochre",
};

const ACCENT_PROGRESS: Record<string, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  ochre: "bg-ochre",
};

const ACCENT_GLOW: Record<string, string> = {
  primary: "shadow-[0_0_6px_oklch(0.78_0.16_75/0.5)]",
  success: "shadow-[0_0_6px_oklch(0.62_0.16_155/0.5)]",
  warning: "shadow-[0_0_6px_oklch(0.75_0.15_80/0.5)]",
  danger: "shadow-[0_0_6px_oklch(0.62_0.22_25/0.5)]",
  ochre: "shadow-[0_0_6px_oklch(0.78_0.16_75/0.5)]",
};

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
        "relative p-5 overflow-hidden",
        "card-elevated",
        "border-l-2",
        featured ? ACCENT_BORDER[accent] : "border-l-transparent",
        "hover:border-border/80 hover:card-elevated-hover",
        "transition-[border-color,box-shadow] duration-200",
        "section-enter",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            {label}
          </span>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  className="text-muted-foreground/50 hover:text-foreground transition-colors cursor-help p-0.5 rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Explicación de ${label}`}
                >
                  <HelpCircle className="size-3" />
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
              "size-3.5 shrink-0",
              featured ? ACCENT_TEXT[accent] : "text-muted-foreground/50",
            )}
          />
        )}
      </div>

      {/* Main value */}
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-1">
        <span
          className={cn(
            "font-mono font-bold tracking-tight tabular-nums leading-none",
            featured ? ACCENT_TEXT[accent] : "text-foreground",
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

      {/* Sparkline */}
      {sparklineData && sparklineData.length >= 2 && (
        <Sparkline data={sparklineData} tone={sparklineTone} height={28} className="mb-2" />
      )}

      {/* Subvalue below */}
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

      {/* Progress bar — 2px with glow */}
      {progress !== undefined && (
        <div className="mt-3 h-[2px] w-full bg-foreground/8 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-transform duration-600",
              ACCENT_PROGRESS[accent],
              ACCENT_GLOW[accent],
            )}
            style={{
              width: `${Math.min(Math.max(progress, 0), 100)}%`,
              transformOrigin: "left",
            }}
          />
        </div>
      )}

      {/* Footer: trend + hint */}
      {(hint || trend) && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-foreground/5">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
                computedTrendTone === "success"
                  ? "bg-success/10 text-success"
                  : computedTrendTone === "warning"
                    ? "bg-warning/10 text-warning"
                    : "bg-danger/10 text-danger",
              )}
            >
              {trend.positive ? (
                <TrendingUp className="size-2.5" />
              ) : (
                <TrendingDown className="size-2.5" />
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
