import { memo } from "react";
import { abbreviateSucursal, money, statusFromPct90 } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export type BranchSummaryRow = {
  id: string;
  label: string;
  meta: number;
  facturado: number;
  pct: number;
};

const ACCENT_VAR: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

const TEXT_ACCENT_CLASS: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const STATUS_LABEL: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "Cumplió",
  warning: "Aceptable",
  danger: "Atención",
};

export const BranchSummaryTable = memo(function BranchSummaryTable({
  rows,
}: {
  rows: BranchSummaryRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-display text-sm font-semibold">Resumen por sucursal</h3>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              Sin datos para el período
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="card-elevated section-enter overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-display text-sm font-semibold">Resumen por sucursal</h3>
      </div>
      <Table className="text-xs">
        <TableHeader className="bg-accent border-b border-border [&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-accent-foreground px-2 py-1.5 text-left text-[10px] font-semibold tracking-wider uppercase">
              Suc.
            </TableHead>
            <TableHead className="text-accent-foreground px-2 py-1.5 text-right text-[10px] font-semibold tracking-wider uppercase">
              Meta
            </TableHead>
            <TableHead className="text-accent-foreground px-2 py-1.5 text-right text-[10px] font-semibold tracking-wider uppercase">
              Vendido
            </TableHead>
            <TableHead className="text-accent-foreground px-2 py-1.5 text-left text-[10px] font-semibold tracking-wider uppercase">
              Avance
            </TableHead>
            <TableHead className="text-accent-foreground px-2 py-1.5 text-center text-[10px] font-semibold tracking-wider uppercase">
              Estado
            </TableHead>
            <TableHead className="text-accent-foreground px-2 py-1.5 text-right text-[10px] font-semibold tracking-wider uppercase">
              Falt. / Extra
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const status = statusFromPct90(r.pct);
            const brecha = r.meta - r.facturado;
            return (
              <TableRow key={r.id}>
                <TableCell className="px-2 py-1.5 font-normal" title={r.label}>
                  {abbreviateSucursal(r.label)}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right tabular-nums">
                  {money(r.meta)}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right tabular-nums">
                  {money(r.facturado)}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("tabular-nums", TEXT_ACCENT_CLASS[status])}>
                      {r.pct.toFixed(1)}%
                    </span>
                    <div
                      className="progress-track w-10"
                      role="progressbar"
                      aria-label={`Avance de ${r.label}`}
                      aria-valuenow={Math.round(Math.min(r.pct, 100))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="progress-fill"
                        style={{
                          transform: `scaleX(${Math.min(r.pct, 100) / 100})`,
                          background: ACCENT_VAR[status],
                        }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-center">
                  <span className={cn("text-[10px] font-normal", TEXT_ACCENT_CLASS[status])}>
                    {STATUS_LABEL[status]}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right tabular-nums font-normal">
                  {brecha > 0 ? (
                    <span className="text-danger">-{money(brecha)}</span>
                  ) : (
                    <span className="text-success">+{money(Math.abs(brecha))}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
});
