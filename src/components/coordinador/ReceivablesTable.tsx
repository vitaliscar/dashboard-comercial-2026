import { memo, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, int } from "@/lib/format";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { CircleCheck } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";

const PAGE_SIZE = 15;

export type ReceivableRow = {
  id?: string;
  sucursalVenta?: string;
  cliente: string;
  unidadId?: string;
  unidadLabel?: string;
  diasVencidos?: number;
  total: number;
};

type Props = {
  rows: ReceivableRow[];
  unitOptions?: { value: string; label: string }[];
  sucursalOptions?: { value: string; label: string }[];
};

export const ReceivablesTable = memo(function ReceivablesTable({
  rows,
  unitOptions = [],
  sucursalOptions = [],
}: Props) {
  const [unidadFiltro, setUnidadFiltro] = useState("all");
  const [sucursalFiltro, setSucursalFiltro] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        const matchesUnit = unidadFiltro === "all" || !r.unidadId || r.unidadId === unidadFiltro;
        const matchesSucursal =
          sucursalFiltro === "all" ||
          !r.sucursalVenta ||
          r.sucursalVenta.toLowerCase() === sucursalFiltro.toLowerCase();
        return matchesUnit && matchesSucursal;
      })
      .sort((a, b) => b.total - a.total);
  }, [rows, unidadFiltro, sucursalFiltro]);

  const grandTotal = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (r.total || 0), 0);
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [unidadFiltro, sucursalFiltro]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold">Cuentas por Cobrar</h3>
          <p className="text-xs text-muted-foreground">
            Detalle y saldo pendiente ({filtered.length} clientes)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sucursalOptions.length > 0 && (
            <Select
              items={[{ value: "all", label: "Todas las sucursales" }, ...sucursalOptions]}
              value={sucursalFiltro}
              onValueChange={(v) => setSucursalFiltro(v ?? "all")}
            >
              <SelectTrigger
                id="sucursal-venta-filter"
                className="h-9 w-[180px] bg-background border border-input text-sm font-semibold"
              >
                <SelectValue placeholder="Sucursal Venta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {sucursalOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {unitOptions.length > 0 && (
            <Select
              items={[{ value: "all", label: "Todas las unidades" }, ...unitOptions]}
              value={unidadFiltro}
              onValueChange={(v) => setUnidadFiltro(v ?? "all")}
            >
              <SelectTrigger className="h-9 w-[180px] bg-background border border-input text-sm font-semibold">
                <SelectValue placeholder="Unidad de negocio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las unidades</SelectItem>
                {unitOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheck className="text-success" />
            </EmptyMedia>
            <EmptyTitle>Sin cuentas por cobrar pendientes</EmptyTitle>
            <EmptyDescription>
              No hay saldos pendientes para la sucursal seleccionada.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Mobile card view (<600px) */}
          <div className="min-[600px]:hidden flex flex-col divide-y divide-border">
            {pageRows.map((r, idx) => (
              <div key={r.id || `${r.cliente}-${idx}`} className="p-3 space-y-1 bg-card">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold text-sm text-foreground">{r.cliente}</span>
                  <span className="font-mono font-bold text-sm text-primary shrink-0">
                    {money(r.total)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sucursal: {r.sucursalVenta || "—"}</span>
                  <span>Vencido: {r.diasVencidos ?? 0} días</span>
                </div>
              </div>
            ))}
            <div className="p-3 bg-muted/30 font-bold flex justify-between text-sm">
              <span>TOTAL</span>
              <span className="font-mono">{money(grandTotal)}</span>
            </div>
          </div>

          {/* Desktop table (≥600px) */}
          <div className="hidden min-[600px]:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-primary [&_tr]:border-b-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                    Sucursal Venta
                  </TableHead>
                  <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                    Nombre Cliente
                  </TableHead>
                  <TableHead className="text-primary-foreground text-right text-xs tracking-wider">
                    Días Vencidos
                  </TableHead>
                  <TableHead className="text-primary-foreground text-right text-xs tracking-wider">
                    TOTAL $
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r, idx) => (
                  <TableRow key={r.id || `${r.cliente}-${idx}`}>
                    <TableCell className="font-medium text-muted-foreground">
                      {r.sucursalVenta || "—"}
                    </TableCell>
                    <TableCell className="font-medium">{r.cliente}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {int(r.diasVencidos ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {money(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-muted/50 font-bold border-t border-border">
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold text-sm">
                    TOTAL GENERAL:
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-primary">
                    {money(grandTotal)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {pageCount > 1 && (
            <div className="border-t border-border p-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={page === 1}
                      className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.max(1, p - 1));
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <PaginationItem key={n}>
                      <PaginationLink
                        href="#"
                        isActive={n === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(n);
                        }}
                      >
                        {n}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={page === pageCount}
                      className={page === pageCount ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.min(pageCount, p + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
});
