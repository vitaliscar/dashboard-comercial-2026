import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { TrendingDown, TrendingUp, HelpCircle, type LucideIcon } from "@/components/icons";
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
  sparklineHeight?: number;
  sparklineLabel?: string;
  sparklineDescription?: string;
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
  sparklineHeight = 28,
  sparklineLabel,
  sparklineDescription,
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
        "ccv-kpi-card relative p-5 overflow-hidden",
        featured && "ccv-kpi-featured",
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
          <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 min-w-0">
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
          {/* Cuando hay gauge, el anillo ya muestra este mismo porcentaje –
              repetirlo como subvalor inline dice el mismo dato dos veces en
              un solo vistazo. */}
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
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length >= 2 && (
        <div
          className="ccv-kpi-sparkline"
          role={sparklineLabel ? "group" : undefined}
          aria-label={sparklineLabel}
        >
          <Sparkline
            data={sparklineData}
            tone={sparklineTone}
            height={sparklineHeight}
            showLastValue={!sparklineLabel}
          />
          {sparklineDescription && <span className="sr-only">{sparklineDescription}</span>}
        </div>
      )}

      {projection && (
        <div className="ccv-kpi-projection flex items-baseline justify-between gap-2 mb-2">
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

      {/* Progress uses one linear scale; drawing is clamped, accessible text preserves the real value. */}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, progress))} aria-valuetext={`${progress.toFixed(1)}%`}>
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              ACCENT_PROGRESS[accent],
            )}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
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
