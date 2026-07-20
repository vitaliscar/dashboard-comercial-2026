import { memo, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/lib/format";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
  cliente: string;
  unidadId: string;
  unidadLabel: string;
  total: number;
};

type Props = {
  rows: ReceivableRow[];
  unitOptions: { value: string; label: string }[];
};

export const ReceivablesTable = memo(function ReceivablesTable({ rows, unitOptions }: Props) {
  const [unidadFiltro, setUnidadFiltro] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const scoped = unidadFiltro === "all" ? rows : rows.filter((r) => r.unidadId === unidadFiltro);
    return [...scoped].sort((a, b) => b.total - a.total);
  }, [rows, unidadFiltro]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [unidadFiltro]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold">Clientes Cuentas x Cobrar</h3>
          <p className="text-xs text-muted-foreground">Saldo pendiente por cliente y unidad</p>
        </div>
        <Select
          items={[{ value: "all", label: "Todas las unidades" }, ...unitOptions]}
          value={unidadFiltro}
          onValueChange={(v) => setUnidadFiltro(v ?? "all")}
        >
          <SelectTrigger className="h-9 w-[200px] bg-background border border-input text-sm font-semibold">
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
      </div>
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              Sin cuentas por cobrar pendientes
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader className="bg-primary [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                  Nombre cliente
                </TableHead>
                <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                  Unidad de negocio
                </TableHead>
                <TableHead className="text-primary-foreground text-right text-xs tracking-wider">
                  Total $
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((r) => (
                <TableRow key={`${r.cliente}-${r.unidadId}`}>
                  <TableCell className="font-medium">{r.cliente}</TableCell>
                  <TableCell className="text-muted-foreground">{r.unidadLabel}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {money(r.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
