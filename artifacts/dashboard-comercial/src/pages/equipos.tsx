"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import {
  getDateRangesForMonths,
  getAllMonthsCap,
  getHighlightMonthLabels,
  diasVencidosDesde,
} from "@/lib/date-range";
import { getMonthlySalesProjection } from "@/lib/business-days";
import {
  getPresupuestosEquiposAction,
  getEquiposVentasPerdidasAction,
  getEquiposClientesCobroAction,
  getEquiposPorMarcaAction,
  getEquiposInventarioAction,
} from "@/lib/actions/equipos";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { useMemo, useState } from "react";
import { TrendingUp, Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
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
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Equipos() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const sucursal = filters.sucursales[0] ?? "all";
  const [searchClientes, setSearchClientes] = useState("");

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses, sucursales: f.sucursal ? [f.sucursal] : [] });
  };

  const { data: sucursales } = useSucursales();

  const { data: presupuestosData, isLoading } = useQuery({
    queryKey: ["presupuestos-equipos", anio, JSON.stringify(meses), sucursal],
    queryFn: () => getPresupuestosEquiposAction({ anio, meses, sucursal }),
  });

  // Año completo (sin filtro de mes) para la evolución mensual, que siempre se
  // muestra hasta la fecha con el mes en revisión resaltado.
  const { data: presupuestosYtdData } = useQuery({
    queryKey: ["presupuestos-equipos-ytd", anio, sucursal],
    queryFn: () => getPresupuestosEquiposAction({ anio, meses: "all", sucursal }),
  });

  const { data: ventasPerdidas } = useQuery({
    queryKey: ["equipos-ventas-perdidas", anio, JSON.stringify(meses)],
    queryFn: () => getEquiposVentasPerdidasAction({ ranges: dateRanges }),
  });

  const { data: clientesCobro } = useQuery({
    queryKey: ["equipos-clientes-cobro"],
    queryFn: () => getEquiposClientesCobroAction(),
  });

  // Año completo — igual que presupuestosYtdData: si el mes filtrado es el
  // actual (sin cerrar todavía en el Excel), esta tabla no tiene filas para
  // ese mes y el gráfico se quedaría sin datos que mostrar.
  const { data: porMarcaData } = useQuery({
    queryKey: ["equipos-por-marca", anio],
    queryFn: () => getEquiposPorMarcaAction({ anio, meses: "all" }),
  });

  const { data: inventarioData } = useQuery({
    queryKey: ["equipos-inventario"],
    queryFn: () => getEquiposInventarioAction(),
  });

  const ventasConsolidadasTotal = useMemo(() => {
    if (!presupuestosData) return 0;
    return presupuestosData.reduce(
      (sum, p) =>
        sum +
        Number(p.ventasCcv || 0) +
        Number(p.ventasXibi || 0) +
        Number(p.ventasEstrategicas || 0),
      0,
    );
  }, [presupuestosData]);

  const cumplimientoGeneral = useMemo(() => {
    const totalPresupuesto = (presupuestosData ?? []).reduce(
      (sum, p) => sum + Number(p.monto || 0),
      0,
    );
    return {
      facturado: ventasConsolidadasTotal,
      presupuesto: totalPresupuesto,
      pct: totalPresupuesto > 0 ? (ventasConsolidadasTotal / totalPresupuesto) * 100 : 0,
    };
  }, [presupuestosData, ventasConsolidadasTotal]);

  const salesProjection = useMemo(
    () =>
      getMonthlySalesProjection(
        ventasConsolidadasTotal,
        cumplimientoGeneral.presupuesto,
        anio,
        meses,
      ),
    [ventasConsolidadasTotal, cumplimientoGeneral.presupuesto, anio, meses],
  );

  const monthlyCombo = useMemo(() => {
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      presupuesto: 0,
      venta: 0,
    }));
    (presupuestosYtdData ?? []).forEach((p) => {
      const m = p.mes - 1;
      if (m >= 0 && m < 12) {
        byMonth[m].presupuesto += Number(p.monto || 0);
        byMonth[m].venta +=
          Number(p.ventasCcv || 0) + Number(p.ventasXibi || 0) + Number(p.ventasEstrategicas || 0);
      }
    });
    return byMonth.slice(0, getAllMonthsCap(anio));
  }, [presupuestosYtdData, anio]);

  const highlightMonths = useMemo(() => getHighlightMonthLabels(meses), [meses]);

  const porCompaniaData = useMemo(() => {
    if (!presupuestosData) return [];
    let totalCcv = 0;
    let totalXibi = 0;
    let totalEstrategicas = 0;
    presupuestosData.forEach((p) => {
      totalCcv += Number(p.ventasCcv || 0);
      totalXibi += Number(p.ventasXibi || 0);
      totalEstrategicas += Number(p.ventasEstrategicas || 0);
    });
    return [
      { label: "Consorcio Venequip", facturado: totalCcv },
      { label: "Xibi", facturado: totalXibi },
      { label: "Estratégicas", facturado: totalEstrategicas },
    ].filter((item) => item.facturado > 0);
  }, [presupuestosData]);

  const sucursalPerformanceData = useMemo(() => {
    if (!presupuestosData || !sucursales) return [];
    const map = new Map<string, { nombre: string; monto: number; presupuesto: number }>();
    sucursales.forEach((s) => map.set(s.id, { nombre: s.nombre, monto: 0, presupuesto: 0 }));

    presupuestosData.forEach((r) => {
      if (r.sucursalId && map.has(r.sucursalId)) {
        const item = map.get(r.sucursalId)!;
        item.monto +=
          Number(r.ventasCcv || 0) + Number(r.ventasXibi || 0) + Number(r.ventasEstrategicas || 0);
        item.presupuesto += Number(r.monto || 0);
      }
    });

    return Array.from(map.values())
      .filter((r) => r.monto > 0 || r.presupuesto > 0)
      .map((r) => ({
        ...r,
        pctCumplimiento: r.presupuesto > 0 ? (r.monto / r.presupuesto) * 100 : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [presupuestosData, sucursales]);

  const porMarcaDonut = useMemo(() => {
    const map = new Map<string, number>();
    (porMarcaData ?? []).forEach((r) => {
      map.set(r.marca, (map.get(r.marca) ?? 0) + Number(r.monto || 0));
    });
    return Array.from(map.entries())
      .map(([label, facturado]) => ({ label, facturado }))
      .filter((r) => r.facturado > 0)
      .sort((a, b) => b.facturado - a.facturado);
  }, [porMarcaData]);

  const inventarioRows = useMemo(() => {
    return (inventarioData ?? [])
      .map((r) => ({
        marca: r.marca,
        tipoEquipo: r.tipoEquipo,
        disponible: Number(r.disponible || 0),
        stockDisponible: r.stockDisponible,
        transito: Number(r.transito || 0),
        stockTransito: r.stockTransito,
      }))
      .sort((a, b) => b.disponible - a.disponible);
  }, [inventarioData]);

  const clientesFiltrados = useMemo(() => {
    const s = searchClientes.toLowerCase();
    return (clientesCobro ?? [])
      .filter((r) => r.cliente.toLowerCase().includes(s))
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
  }, [clientesCobro, searchClientes]);

  if (isLoading && !presupuestosData) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Dashboard de Equipos</h1>
        </div>
        <PageSkeleton
          kpis={2}
          blocks={[{ cols: 6 }, { cols: 1 }, { cols: 1 }, { cols: 1, height: 260 }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard de Equipos</h1>
      </div>
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={
          role === "gerencia"
            ? sucursales?.map((s) => ({ value: s.id, label: s.nombre }))
            : undefined
        }
        defaultMes={meses}
        defaultAnio={anio}
        showAllMonths
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="Ventas Consolidadas"
          value={money(ventasConsolidadasTotal)}
          accent="ochre"
          icon={TrendingUp}
          projection={
            salesProjection
              ? { value: money(salesProjection.projectedSales), tone: salesProjection.tone }
              : undefined
          }
          hint="Total facturado CCV + Xibi + Estratégicas"
        />
        <KpiCard
          label="Inventario Disponible"
          value={money(inventarioRows.reduce((a, r) => a + r.disponible, 0))}
          accent="primary"
          icon={Package}
          hint={`En tránsito: ${money(inventarioRows.reduce((a, r) => a + r.transito, 0))}`}
        />
      </div>

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Desempeño por sucursal</h2>
          <p className="text-xs text-muted-foreground">
            Cumplimiento general, facturación por compañía y detalle por sucursal
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <ComplianceGauge
            title="Cumplimiento General Equipos"
            pct={cumplimientoGeneral.pct}
            facturado={cumplimientoGeneral.facturado}
            presupuesto={cumplimientoGeneral.presupuesto}
          />
          <div className="lg:col-span-2">
            <UnitDonut data={porCompaniaData} title="Facturación por Compañía" />
          </div>
          <div className="lg:col-span-3">
            <SucursalPerformanceChart data={sucursalPerformanceData} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Evolución mensual</h2>
          <p className="text-xs text-muted-foreground">
            Venta real vs. presupuesto, año a la fecha — mes en revisión resaltado
          </p>
        </header>
        <GlobalMonthlyCombo data={monthlyCombo} highlightMonths={highlightMonths} />
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <header>
          <h2 className="font-display text-lg font-semibold">Participación por marca</h2>
          <p className="text-xs text-muted-foreground">Generac, CAT, EP Equipment, Weichai…</p>
        </header>
        <UnitDonut data={porMarcaDonut} title="Ventas por Marca" />
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Inventario</h2>
          <p className="text-xs text-muted-foreground">
            Disponible y en tránsito, por marca y tipo
          </p>
        </header>
        <div className="card-elevated overflow-hidden">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Marca
                </TableHead>
                <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Tipo de Equipo
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Stock Disp.
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Total $ Disp.
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Stock Tránsito
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Total $ Tránsito
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventarioRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Package />
                        </EmptyMedia>
                        <EmptyTitle>Sin datos de inventario</EmptyTitle>
                        <EmptyDescription>
                          El inventario de equipos no está cargado para la sucursal o unidad
                          seleccionada.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                inventarioRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 py-2.5 font-medium">{row.marca}</TableCell>
                    <TableCell className="px-4 py-2.5">{row.tipoEquipo}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {row.stockDisponible}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {money(row.disponible)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {row.stockTransito}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {money(row.transito)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Ventas perdidas</h2>
          <p className="text-xs text-muted-foreground">Oportunidades no concretadas</p>
        </header>
        {(ventasPerdidas?.length ?? 0) === 0 ? (
          <div className="card-elevated p-5 h-40 flex items-center justify-center text-muted-foreground text-sm">
            Sin ventas perdidas registradas en el período
          </div>
        ) : (
          <div className="card-elevated overflow-hidden">
            <Table className="text-sm">
              <TableHeader className="bg-primary [&_tr]:border-b-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                    Cliente
                  </TableHead>
                  <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                    Razón
                  </TableHead>
                  <TableHead className="text-primary-foreground text-right px-4 py-2 font-medium text-xs">
                    Monto
                  </TableHead>
                  <TableHead className="text-primary-foreground text-left px-4 py-2 font-medium text-xs">
                    Fecha
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ventasPerdidas ?? []).slice(0, 8).map((r, i) => (
                  <TableRow
                    key={i}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="px-4 py-2 font-medium">{r.cliente || "—"}</TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground text-xs">
                      {r.razon || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right tabular-nums">
                      {money(Number(r.monto))}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground text-xs">
                      {r.fecha?.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Cuentas por cobrar</h2>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchClientes}
              onChange={(e) => setSearchClientes(e.target.value)}
              placeholder="Buscar cliente…"
              className="pl-8 h-9"
            />
          </div>
        </header>
        <ReceivablesTable
          rows={clientesFiltrados.map((r) => ({
            id: r.id,
            cliente: r.cliente,
            sucursalVenta: sucursales?.find((s) => s.id === r.sucursalId)?.nombre,
            diasVencidos: diasVencidosDesde(r.fechaVencimiento),
            total: Number(r.saldo),
          }))}
        />
      </section>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
