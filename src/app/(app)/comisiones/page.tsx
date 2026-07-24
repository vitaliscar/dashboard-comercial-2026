"use client";

import { useQuery } from "@tanstack/react-query";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { money, pct } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import {
  getComisionesReglasAction,
  getComisionesCumplimientoAction,
} from "@/lib/actions/comisiones";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useMemo } from "react";
import { DollarSign, TrendingUp, Users } from "lucide-react";

interface ReglaComision {
  id: string;
  unidadNegocioId: string | null;
  umbralMinPct: string;
  umbralMaxPct: string | null;
  tasaComision: string;
  activa: boolean;
}

function findTasa(pctCumplimiento: number, reglas: ReglaComision[]) {
  for (const r of reglas) {
    if (!r.activa) continue;
    const min = Number(r.umbralMinPct);
    const max = r.umbralMaxPct === null ? null : Number(r.umbralMaxPct);
    if (pctCumplimiento >= min && (max === null || pctCumplimiento <= max)) {
      return Number(r.tasaComision);
    }
  }
  return 0;
}

export default function ComisionesPage() {
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const { data: unidades } = useUnidades();

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: reglas } = useQuery({
    queryKey: ["comisiones_reglas"],
    queryFn: () => getComisionesReglasAction(),
  });

  const { data: rows } = useQuery({
    queryKey: ["comisiones", "cumplimiento", anio, meses, selectedUnidades],
    queryFn: () =>
      getComisionesCumplimientoAction({ anio, meses, unidades: selectedUnidades ?? [] }),
  });

  const calculos = useMemo(() => {
    const list = (rows ?? []).map((r) => {
      const pctCumplimiento = Number(r.pctCumplimiento);
      const venta = Number(r.venta);
      const tasa = findTasa(pctCumplimiento, reglas ?? []);
      const comision = venta * tasa;
      return {
        id: r.id,
        asesor: r.asesor,
        codigoAsesor: r.codigoAsesor,
        venta,
        pctCumplimiento,
        tasa,
        comision,
      };
    });

    const totalVenta = list.reduce((acc, x) => acc + x.venta, 0);
    const totalComision = list.reduce((acc, x) => acc + x.comision, 0);
    const top = [...list].sort((a, b) => b.comision - a.comision).slice(0, 5);

    return { list, totalVenta, totalComision, top };
  }, [rows, reglas]);

  const unitOptions = useMemo(() => {
    if (!unidades) return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Incentivos"
        title="Comisiones Proyectadas"
        description="Comisión estimada por asesor según cumplimiento de presupuesto."
      />

      <FilterHeader
        defaultAnio={anio}
        defaultMes={meses}
        defaultUnits={selectedUnidades}
        unitOptions={unitOptions}
        onApplyFilters={handleApplyFilters}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Comisión Total Proyectada"
          value={money(calculos.totalComision)}
          icon={DollarSign}
        />
        <KpiCard label="Venta Total" value={money(calculos.totalVenta)} icon={TrendingUp} />
        <KpiCard
          label="Asesores"
          value={String(new Set(calculos.list.map((x) => x.codigoAsesor)).size)}
          icon={Users}
        />
      </div>

      {calculos.list.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No hay datos de cumplimiento para el período seleccionado.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asesor</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Venta</TableHead>
                <TableHead className="text-right">Cumplimiento</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculos.list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.asesor}</TableCell>
                  <TableCell>{row.codigoAsesor}</TableCell>
                  <TableCell className="text-right">{money(row.venta)}</TableCell>
                  <TableCell className="text-right">{pct(row.pctCumplimiento / 100)}</TableCell>
                  <TableCell className="text-right">{pct(row.tasa)}</TableCell>
                  <TableCell className="text-right font-semibold">{money(row.comision)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {calculos.top.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Top comisiones</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {calculos.top.map((row, idx) => (
              <KpiCard
                key={row.id}
                label={`#${idx + 1} ${row.asesor}`}
                value={money(row.comision)}
                subvalue={pct(row.pctCumplimiento / 100)}
                subvalueLabel="cumplimiento"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
