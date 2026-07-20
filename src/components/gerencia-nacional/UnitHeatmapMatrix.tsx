import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { money, statusFromPct90 } from "@/lib/format";
import { SegmentedToggle } from "./SegmentedToggle";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export type MatrixCellValue = { meta: number; facturado: number; pct: number };
export type MatrixRow = {
  sucursalId: string;
  sucursal: string;
  cells: Record<string, MatrixCellValue | undefined>;
  general: MatrixCellValue;
};
export type MatrixUnit = { id: string; label: string };

const HEAT_CLASS: Record<ReturnType<typeof statusFromPct90>, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

function Cell({
  value,
  mode,
  showGap,
}: {
  value: MatrixCellValue | undefined;
  mode: "pct" | "mon" | "gap";
  showGap?: boolean;
}) {
  if (!value || (value.meta <= 0 && value.facturado <= 0)) {
    return <span className="text-muted-foreground text-[10px]">–</span>;
  }

  const cls = HEAT_CLASS[statusFromPct90(value.pct)];
  const gap = value.meta - value.facturado;

  if (mode === "gap") {
    const isOver = gap <= 0;
    return (
      <span
        className={cn(
          "block w-full min-w-16 rounded px-1 py-1.5",
          isOver ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
        )}
      >
        <span className="block text-xs font-bold">{isOver ? "✓" : money(Math.abs(gap))}</span>
        <span className="block text-[10px] text-muted-foreground">
          {isOver ? "cumplido" : "faltante"}
        </span>
      </span>
    );
  }

  const main = mode === "pct" ? `${value.pct.toFixed(0)}%` : money(value.facturado);
  const sub = mode === "pct" ? money(value.facturado) : `${value.pct.toFixed(0)}%`;

  return (
    <span className={cn("block w-full min-w-16 rounded px-1 py-1.5", cls)}>
      <span className="block text-xs font-bold">{main}</span>
      {showGap && gap > 0 && (
        <span className="block text-[10px] text-danger/80">-{money(gap)}</span>
      )}
      <span className="block text-[10px] text-muted-foreground">{sub}</span>
    </span>
  );
}

export const UnitHeatmapMatrix = memo(function UnitHeatmapMatrix({
  rows,
  units,
}: {
  rows: MatrixRow[];
  units: MatrixUnit[];
}) {
  const [mode, setMode] = useState<"pct" | "mon" | "gap">("pct");

  // Calculate unit totals for summary row
  const unitTotals = units.map((u) => {
    let meta = 0;
    let facturado = 0;
    rows.forEach((row) => {
      const cell = row.cells[u.id];
      if (cell) {
        meta += cell.meta;
        facturado += cell.facturado;
      }
    });
    const pct = meta > 0 ? (facturado / meta) * 100 : 0;
    return { id: u.id, label: u.label, meta, facturado, pct };
  });

  const totalMeta = rows.reduce((sum, r) => sum + r.general.meta, 0);
  const totalFacturado = rows.reduce((sum, r) => sum + r.general.facturado, 0);
  const totalPct = totalMeta > 0 ? (totalFacturado / totalMeta) * 100 : 0;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="font-display font-semibold">Matriz sucursal × unidad</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "pct" && "Cumplimiento por unidad en cada sucursal"}
            {mode === "mon" && "Monto facturado por unidad en cada sucursal"}
            {mode === "gap" && "Faltante para cumplir meta (rojo) o cumplido (verde)"}
          </p>
        </div>
        <SegmentedToggle
          value={mode}
          onChange={setMode}
          options={[
            { value: "pct", label: "%" },
            { value: "mon", label: "Monto" },
            { value: "gap", label: "Gap" },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3 py-2 text-left text-xs font-medium tracking-wider text-primary-foreground sticky left-0 bg-primary z-10">
                Sucursal
              </TableHead>
              {units.map((u) => (
                <TableHead
                  key={u.id}
                  className="px-2 py-2 text-center text-xs font-medium tracking-wider text-primary-foreground"
                >
                  {u.label}
                </TableHead>
              ))}
              <TableHead className="px-2 py-2 text-center text-xs font-medium tracking-wider text-primary-foreground bg-primary/80">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={units.length + 2} className="p-0">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle className="text-sm font-normal text-muted-foreground">
                        Sin datos
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((row) => (
                  <TableRow key={row.sucursalId}>
                    <TableCell className="px-3 py-2 text-xs font-medium sticky left-0 bg-card z-10 border-r border-border">
                      {row.sucursal}
                    </TableCell>
                    {units.map((u) => (
                      <TableCell key={u.id} className="px-2 py-2 text-center">
                        <Cell value={row.cells[u.id]} mode={mode} showGap={mode !== "gap"} />
                      </TableCell>
                    ))}
                    <TableCell className="px-2 py-2 text-center bg-muted/30">
                      <Cell value={row.general} mode={mode} showGap={mode !== "gap"} />
                    </TableCell>
                  </TableRow>
                ))}
                {/* Summary row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="px-3 py-2 text-xs font-bold sticky left-0 bg-muted/50 z-10 border-r border-border">
                    Total
                  </TableCell>
                  {unitTotals.map((u) => (
                    <TableCell key={u.id} className="px-2 py-2 text-center">
                      <Cell
                        value={{ meta: u.meta, facturado: u.facturado, pct: u.pct }}
                        mode={mode}
                        showGap={mode !== "gap"}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="px-2 py-2 text-center bg-muted/30">
                    <Cell
                      value={{ meta: totalMeta, facturado: totalFacturado, pct: totalPct }}
                      mode={mode}
                      showGap={mode !== "gap"}
                    />
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});
