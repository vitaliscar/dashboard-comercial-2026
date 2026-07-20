import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { money, pct } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { fetchAllRows } from "@/lib/fetch-all-rows";
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

export const Route = createFileRoute("/_app/comisiones")({
  head: () => ({ meta: [{ title: "Comisiones Proyectadas · CCV" }] }),
  component: ComisionesPage,
});

function findTasa(pctCumplimiento: number, reglas: ReglaComision[]) {
  for (const r of reglas) {
    if (!r.activa) continue;
    if (
      pctCumplimiento >= r.umbral_min_pct &&
      (r.umbral_max_pct === null || pctCumplimiento <= r.umbral_max_pct)
    ) {
      return r.tasa_comision;
    }
  }
  return 0;
}

interface ReglaComision {
  id: string;
  unidad_negocio_id: string | null;
  umbral_min_pct: number;
  umbral_max_pct: number | null;
  tasa_comision: number;
  activa: boolean;
}

interface ComisionRow {
  id: string;
  anio: number;
  mes: number;
  codigo_asesor: string;
  asesor: string;
  asesor_id: string | null;
  sucursal_id: string | null;
  unidad_negocio_id: string | null;
  presupuesto: number;
  venta: number;
  pct_cumplimiento: number;
}

function ComisionesPage() {
  const { role, profile, user } = useAuth();
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
    queryFn: async () => {
      const { data, error } = await supabase.from("comisiones_reglas").select("*");
      if (error) throw error;
      return (data as ReglaComision[]) ?? [];
    },
  });

  const { data: rows } = useQuery({
    queryKey: ["comisiones", "cumplimiento", role, profile?.id, anio, meses, selectedUnidades],
    queryFn: async () => {
      let q = supabase.from("cumplimiento_asesores").select("*").eq("anio", anio);

      if (meses !== "all") {
        q = q.in("mes", meses);
      }

      if (selectedUnidades && selectedUnidades.length > 0) {
        q = q.in("unidad_negocio_id", selectedUnidades);
      }

      q = scoped(q, role, profile, user?.id, {
        sucursal: "sucursal_id",
        unidad: "unidad_negocio_id",
        asesor: "asesor_id",
      });

      const data = await fetchAllRows<ComisionRow>(() => q);
      return data ?? [];
    },
  });

  const calculos = useMemo(() => {
    const list = (rows ?? []).map((r) => {
      const tasa = findTasa(r.pct_cumplimiento, reglas ?? []);
      const comision = r.venta * tasa;
      return {
        ...r,
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
          value={String(new Set(calculos.list.map((x) => x.codigo_asesor)).size)}
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
                  <TableCell>{row.codigo_asesor}</TableCell>
                  <TableCell className="text-right">{money(row.venta)}</TableCell>
                  <TableCell className="text-right">{pct(row.pct_cumplimiento / 100)}</TableCell>
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
                subvalue={pct(row.pct_cumplimiento / 100)}
                subvalueLabel="cumplimiento"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
