import { money, abbreviateSucursal } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo, memo } from "react";
import { cn, exportCSV } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

interface Column {
  key: string;
  label: string;
  format?: "currency" | "percentage" | "text" | "abbreviateSucursal";
  tooltip?: boolean;
  width?: string;
  align?: "left" | "right";
  sortable?: boolean;
  /** Nombre del campo en la fila con el valor del período anterior — si se
   * provee, se pinta una flecha ▲▼ junto al valor mostrando el delta. */
  deltaKey?: string;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  showExpandButton?: boolean;
  emptyMessage?: string;
  maxRows?: number;
  enableCSVExport?: boolean;
  csvFilename?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

type SortDirection = "asc" | "desc" | null;

function formatValue(value: unknown, format?: string): string {
  if (format === "currency") return money(value as number);
  if (format === "percentage") return `${(Number(value) || 0).toFixed(1)}%`;
  if (format === "abbreviateSucursal") return abbreviateSucursal(value as string);
  return String(value ?? "-");
}

function DeltaBadge({ current, previous }: { current: unknown; previous: unknown }) {
  const cur = getRawValue(current);
  const prev = getRawValue(previous);
  if (typeof cur !== "number" || typeof prev !== "number") return null;

  const diff = cur - prev;
  if (diff === 0) {
    return <ArrowUpDown className="size-2.5 text-muted-foreground/60 shrink-0" />;
  }
  const pctChange = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null;
  const isUp = diff > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-mono font-medium tabular-nums shrink-0",
        isUp ? "text-success" : "text-destructive",
      )}
    >
      {isUp ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
      {pctChange !== null ? `${Math.abs(pctChange).toFixed(0)}%` : "nuevo"}
    </span>
  );
}

function getRawValue(value: unknown): number | string {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (!isNaN(num)) return num;
  }
  return String(value ?? "");
}

export const DataTable = memo(function DataTable({
  columns,
  data,
  showExpandButton = false,
  emptyMessage = "Sin datos para este periodo",
  maxRows = 5,
  enableCSVExport = false,
  csvFilename = "datos",
  searchable = false,
  searchPlaceholder = "Buscar...",
}: DataTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [search, setSearch] = useState("");

  const hasMore = data.length > maxRows;

  const filteredData = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(lower);
      }),
    );
  }, [data, search, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = getRawValue(a[sortKey]);
      const bVal = getRawValue(b[sortKey]);
      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const displayData = expanded ? sortedData : sortedData.slice(0, maxRows);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      } else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExportCSV = () => {
    exportCSV(columns, sortedData, `${csvFilename}.csv`);
  };

  if (data.length === 0) {
    return (
      <Empty className="rounded-lg border-border bg-card p-4">
        <EmptyHeader>
          <EmptyTitle className="text-xs font-normal text-muted-foreground">
            {emptyMessage}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border/40 overflow-hidden shadow-sm">
      {(searchable || enableCSVExport) && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
          {searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/80" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-7.5 h-6.5 text-[11px] bg-background border-border/40"
              />
            </div>
          )}
          {enableCSVExport && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6.5 text-[10px] ml-auto font-mono text-muted-foreground hover:text-foreground"
              onClick={handleExportCSV}
            >
              <Download className="size-3 mr-1" />
              EXPORTAR CSV
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="table-fixed text-[11px] w-full border-collapse">
          <TableHeader className="bg-muted/30 border-b border-border/30">
            <TableRow className="hover:bg-transparent border-0">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "h-8 px-2.5 py-1.5 font-display text-[9px] font-bold tracking-wider text-muted-foreground uppercase whitespace-normal",
                    col.align === "right" ? "text-right" : "text-left",
                    col.width || "",
                    col.sortable &&
                      "cursor-pointer select-none hover:text-foreground transition-colors",
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "justify-end w-full",
                    )}
                  >
                    {col.label}
                    {col.sortable && sortKey === col.key && sortDir === "asc" && (
                      <ArrowUp className="size-2.5" />
                    )}
                    {col.sortable && sortKey === col.key && sortDir === "desc" && (
                      <ArrowDown className="size-2.5" />
                    )}
                    {col.sortable && sortKey !== col.key && (
                      <ArrowUpDown className="size-2.5 opacity-20" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.length === 0 ? (
              <TableRow className="border-0">
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-4"
                >
                  Sin resultados
                </TableCell>
              </TableRow>
            ) : (
              displayData.map((row, idx) => (
                <TableRow
                  key={idx}
                  className={cn(
                    "border-b border-border/20 hover:bg-muted/10 transition-colors",
                    idx % 2 === 1 ? "bg-muted/5" : "bg-transparent",
                  )}
                >
                  {columns.map((col) => {
                    const val = formatValue(row[col.key], col.format);
                    return (
                      <TableCell
                        key={`${idx}-${col.key}`}
                        className={cn(
                          "px-2.5 py-1.5 text-foreground align-middle text-[11px] leading-normal font-sans",
                          col.align === "right"
                            ? "text-right font-mono font-medium tabular-nums"
                            : "text-left",
                        )}
                      >
                        {col.tooltip ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="truncate block cursor-help hover:text-foreground transition-colors" />
                              }
                            >
                              {val}
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="max-w-[200px] text-[10px] leading-relaxed font-sans"
                            >
                              {String(row[col.key] ?? "")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span
                            className={cn(
                              "flex items-center gap-1",
                              col.align === "right" ? "justify-end" : "justify-start",
                            )}
                          >
                            <span className="truncate">{val}</span>
                            {col.deltaKey && (
                              <DeltaBadge current={row[col.key]} previous={row[col.deltaKey]} />
                            )}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {showExpandButton && (hasMore || expanded) && (
        <div className="border-t border-border/20 p-1 bg-muted/10">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px] text-muted-foreground/80 hover:text-foreground transition-colors font-medium tracking-wide"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "COLAPSAR TABLA" : `VER MÁS (${sortedData.length - maxRows})`}
          </Button>
        </div>
      )}
    </div>
  );
});
