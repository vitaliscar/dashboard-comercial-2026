"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getAllMonthsCap, getHighlightMonthLabels, diasVencidosDesde } from "@/lib/date-range";
import { getMonthlySalesProjection } from "@/lib/business-days";
import {
  getPresupuestosLubfiltrosAction,
  getCobranzasLubfiltrosAction,
  getDetallesVentasLubfiltrosAction,
  getInventarioLubfiltrosAction,
} from "@/lib/actions/lubfiltros";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { MarcasMonthlyChart } from "@/components/lubfiltros/MarcasMonthlyChart";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
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
import { useMemo } from "react";
import { TrendingUp, Droplets } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function LubFiltrosPage() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const sucursal = filters.sucursales[0] ?? "all";

  const { data: sucursales } = useSucursales();

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursal ? [f.sucursal] : [],
    });
  };

  const { data: presupuestosData, isLoading } = useQuery({
    queryKey: ["presupuestos-lubfiltros", anio, JSON.stringify(meses), sucursal],
    queryFn: () => getPresupuestosLubfiltrosAction({ anio, meses, sucursal }),
  });

  // Datos del año completo (sin filtro de mes) para el gráfico de evolución
  // mensual, que siempre debe mostrarse hasta la fecha con el mes en revisión
  // resaltado, no recortado al filtro de mes seleccionado.
  const { data: presupuestosYtdData } = useQuery({
    queryKey: ["presupuestos-lubfiltros-ytd", anio, sucursal],
    queryFn: () => getPresupuestosLubfiltrosAction({ anio, meses: "all", sucursal }),
  });

  const { data: cobranzasData } = useQuery({
    queryKey: ["cobranzas-lubfiltros", sucursal],
    queryFn: () => getCobranzasLubfiltrosAction({ sucursal }),
  });

  // Año completo (sin filtro de mes) — el gráfico de marcas siempre se muestra
  // hasta la fecha con el mes en revisión resaltado, no recortado al filtro.
  const { data: detallesMarcas } = useQuery({
    queryKey: ["detalles-ventas-lubfiltros"],
    queryFn: () => getDetallesVentasLubfiltrosAction({ meses: "all" }),
  });

  const { data: inventario } = useQuery({
    queryKey: ["inventario-lubfiltros"],
    queryFn: () => getInventarioLubfiltrosAction(),
  });

  const sucursalMap = useMemo(() => {
    const map = new Map<string, string>();
    (sucursales ?? []).forEach((s) => map.set(s.id, s.nombre));
    return map;
  }, [sucursales]);

  const sucursalOptions = useMemo(() => {
    return (sucursales ?? []).map((s) => ({ value: s.nombre, label: s.nombre }));
  }, [sucursales]);

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

  // Siempre muestra el año hasta el mes actual (YTD), independiente del filtro
  // de mes — el mes en revisión se resalta en vez de recortar el resto del año.
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

  const marcasMonthly = useMemo(() => {
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      Chronus: 0,
      Donaldson: 0,
      DonaldsonIndustrial: 0,
      OtraMarca: 0,
    }));
    (detallesMarcas ?? []).forEach((d) => {
      const m = d.mes - 1;
      if (m < 0 || m >= 12) return;
      const monto = Number(d.montoTotal || 0);
      if (d.marca === "Chronus") byMonth[m].Chronus += monto;
      else if (d.marca === "Donaldson") byMonth[m].Donaldson += monto;
      else if (d.marca === "Donaldson Industrial") byMonth[m].DonaldsonIndustrial += monto;
      else byMonth[m].OtraMarca += monto;
    });

    return byMonth.slice(0, getAllMonthsCap(anio));
  }, [detallesMarcas, anio]);

  const inventarioTotales = useMemo(() => {
    let lubricantes = 0;
    let filtros = 0;
    (inventario ?? []).forEach((i) => {
      if (i.tipo === "Lubricantes") lubricantes += Number(i.monto || 0);
      else if (i.tipo === "Filtros") filtros += Number(i.monto || 0);
    });
    return { lubricantes, filtros, total: lubricantes + filtros };
  }, [inventario]);

  const inventarioPorSucursal = useMemo(() => {
    const map = new Map<string, { tipo: string; sucursal: string; monto: number }>();
    (inventario ?? []).forEach((i) => {
      const key = `${i.tipo}|${i.sucursal}`;
      const existing = map.get(key);
      if (existing) existing.monto += Number(i.monto || 0);
      else map.set(key, { tipo: i.tipo, sucursal: i.sucursal, monto: Number(i.monto || 0) });
    });
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
  }, [inventario]);

  const receivablesRows = useMemo(() => {
    if (!cobranzasData) return [];
    return cobranzasData.map((c) => ({
      id: c.id,
      sucursalVenta: c.sucursalId
        ? sucursalMap.get(c.sucursalId) || "Sin sucursal"
        : "Sin sucursal",
      cliente: c.cliente,
      diasVencidos: diasVencidosDesde(c.fechaVencimiento),
      total: Number(c.saldo),
    }));
  }, [cobranzasData, sucursalMap]);

  if (isLoading && !presupuestosData) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Dashboard Lubricantes y Filtros</h1>
        </div>
        <PageSkeleton
          kpis={2}
          blocks={[{ cols: 6 }, { cols: 1 }, { cols: 1 }, { cols: 2, height: 260 }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard Lubricantes y Filtros</h1>
      </div>

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={
          role === "gerencia"
            ? sucursales?.map((s) => ({ value: s.id, label: s.nombre }))
            : undefined
        }
        unitOptions={undefined}
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
          label="Inventario Total"
          value={money(inventarioTotales.total)}
          accent="primary"
          icon={Droplets}
          hint={`Lubricantes ${money(inventarioTotales.lubricantes)} · Filtros ${money(inventarioTotales.filtros)}`}
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
            title="Cumplimiento General LUB/FILTROS"
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
          <h2 className="font-display text-lg font-semibold">Ventas por marca</h2>
          <p className="text-xs text-muted-foreground">Chronus, Donaldson y Donaldson Industrial</p>
        </header>
        <MarcasMonthlyChart data={marcasMonthly} highlightMonths={highlightMonths} />
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Inventario</h2>
          <p className="text-xs text-muted-foreground">
            Lubricantes y Filtros disponibles por sucursal
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UnitDonut
            data={[
              { label: "Lubricantes", facturado: inventarioTotales.lubricantes },
              { label: "Filtros", facturado: inventarioTotales.filtros },
            ].filter((d) => d.facturado > 0)}
            title="Lubricantes vs Filtros"
            innerRadius="45%"
            outerRadius="75%"
          />
          <div className="card-elevated overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-display font-semibold">Inventario por Sucursal</h3>
              <p className="text-xs text-muted-foreground">Valor en inventario</p>
            </div>
            <Table className="text-sm">
              <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                    Tipo
                  </TableHead>
                  <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                    Sucursal
                  </TableHead>
                  <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                    Monto
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventarioPorSucursal.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="p-0">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Droplets />
                          </EmptyMedia>
                          <EmptyTitle>Sin datos de inventario</EmptyTitle>
                          <EmptyDescription>
                            El inventario de lubricantes y filtros no está cargado para la sucursal
                            seleccionada.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  inventarioPorSucursal.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-4 py-2.5 font-medium">{row.tipo}</TableCell>
                      <TableCell className="px-4 py-2.5">{row.sucursal}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right tabular-nums">
                        {money(row.monto)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Cuentas por cobrar</h2>
        </header>
        <ReceivablesTable rows={receivablesRows} sucursalOptions={sucursalOptions} />
      </section>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
