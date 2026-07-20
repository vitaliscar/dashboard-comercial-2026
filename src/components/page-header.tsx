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
        <p className="text-[10px] tracking-[0.14em] font-display font-bold text-muted-foreground mb-1 uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl font-black tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-[70ch]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
