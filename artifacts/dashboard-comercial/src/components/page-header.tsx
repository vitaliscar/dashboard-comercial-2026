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
      className={cn("ccv-page-header flex flex-wrap justify-between items-end gap-3 border-b border-border/70 pb-5", className)}
    >
      <div className="min-w-0">
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
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
