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
  progressVariant?: "linear" | "gauge";
  sparklineData?: number[];
  className?: string;
  valueClassName?: string;
  subvalueClassName?: string;
  subvalueLabelClassName?: string;
  flush?: boolean;
  projection?: {
    value: string;
    tone: "success" | "warning" | "danger";
    label?: string;
  };
}

const ACCENT_STROKE: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  ochre: "var(--color-ochre)",
};

function RadialGauge({ progress, accent }: { progress: number; accent: string }) {
  const pct = Math.min(Math.max(progress, 0), 100);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={5}
        />
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke={ACCENT_STROKE[accent]}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-bold tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

const ACCENT_RING: Record<string, string> = {
  primary: "ring-1 ring-primary/25",
  success: "ring-1 ring-success/25",
  warning: "ring-1 ring-warning/25",
  danger: "ring-1 ring-danger/25",
  ochre: "ring-1 ring-ochre/25",
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
  primary: "shadow-[0_0_6px_oklch(0.72_0.09_230/0.5)]",
  success: "shadow-[0_0_6px_oklch(0.62_0.16_155/0.5)]",
  warning: "shadow-[0_0_6px_oklch(0.75_0.15_80/0.5)]",
  danger: "shadow-[0_0_6px_oklch(0.62_0.22_25/0.5)]",
  ochre: "shadow-[0_0_6px_oklch(0.75_0.15_80/0.5)]",
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
  progressVariant = "linear",
  sparklineData,
  className,
  valueClassName,
  subvalueClassName,
  subvalueLabelClassName,
  flush = false,
  projection,
}: KpiCardProps) {
  const computedTrendTone = trendTone ?? (trend?.positive ? "success" : "danger");
  const sparklineTone =
    accent === "success" || accent === "danger" || accent === "warning" ? accent : "primary";

  return (
    <div
      className={cn(
        "relative p-5 overflow-hidden",
        flush
          ? "hover:bg-foreground/[0.02] transition-colors duration-200"
          : cn(
              "card-elevated",
              featured ? ACCENT_RING[accent] : "",
              "hover:border-border/80 hover:card-elevated-hover",
              "transition-[border-color,box-shadow] duration-200",
              "section-enter",
            ),
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
        {Icon && !(progress !== undefined && progressVariant === "gauge") && (
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

      {projection && (
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[10px] font-display font-semibold text-muted-foreground">
            {projection.label ?? "Proy. cierre mes"}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-bold tabular-nums",
              projection.tone === "success"
                ? "text-success"
                : projection.tone === "warning"
                  ? "text-warning"
                  : "text-danger",
            )}
          >
            {projection.value}
          </span>
        </div>
      )}

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

      {/* Radial gauge — alternative to the linear bar for target-attainment KPIs */}
      {progress !== undefined && progressVariant === "gauge" && (
        <div className="absolute top-4 right-5">
          <RadialGauge progress={progress} accent={accent} />
        </div>
      )}

      {/* Progress bar — 2px with glow */}
      {progress !== undefined && progressVariant === "linear" && (
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
