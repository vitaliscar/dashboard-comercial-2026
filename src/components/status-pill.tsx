import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "warning" | "danger" | "neutral";

const ICON = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: null,
} as const;

const KIND_CLASS: Record<Kind, string> = {
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
  neutral: "bg-card text-foreground border border-border",
};

export function StatusPill({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const Icon = ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-lg px-2 py-0.5 font-display text-[10px] font-bold tracking-wide whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
        KIND_CLASS[kind],
      )}
    >
      {Icon && <Icon />}
      {children}
    </span>
  );
}

export function estadoLabel(e: string) {
  return { pendiente: "Pendiente", en_proceso: "En proceso", cumplido: "Cumplido" }[e] ?? e;
}
export function estadoKind(e: string): Kind {
  return (
    ({ pendiente: "warning", en_proceso: "neutral", cumplido: "success" }[e] as Kind) ?? "neutral"
  );
}
