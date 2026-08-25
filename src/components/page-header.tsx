import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-wrap justify-between items-end gap-4 card-elevated p-5", className)}
    >
      <div className="min-w-0">
        <p className="text-[9px] font-mono font-bold tracking-[0.18em] text-primary uppercase mb-1.5">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-[70ch]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
