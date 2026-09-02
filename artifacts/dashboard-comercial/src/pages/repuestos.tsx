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
  getPresupuestosRepuestosAction,
  getCobranzasRepuestosAction,
  getDetallesVentasRepuestosAction,
} from "@/lib/actions/repuestos";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";
import { CompanyMonthlyStackedLines } from "@/components/servicios/CompanyMonthlyStackedLines";
import { useMemo } from "react";
import { TrendingUp, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function RepuestosPage() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const sucursal = filters.sucursales[0] ?? "all";

  const { data: sucursales } = useSucursales();

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses, sucursales: f.sucursal ? [f.sucursal] : [] });
  };

  const { data: presupuestosData, isLoading } = useQuery({
    queryKey: ["presupuestos-repuestos", anio, JSON.stringify(meses), sucursal],
    queryFn: () => getPresupuestosRepuestosAction({ anio, meses, sucursal }),
  });

  // Año completo (sin filtro de mes) para la evolución mensual, que siempre se
  // muestra hasta la fecha con el mes en revisión resaltado.
  const { data: presupuestosYtdData } = useQuery({
    queryKey: ["presupuestos-repuestos-ytd", anio, sucursal],
    queryFn: () => getPresupuestosRepuestosAction({ anio, meses: "all", sucursal }),
  });

  const { data: cobranzasData } = useQuery({
    queryKey: ["cobranzas-repuestos", sucursal, anio, JSON.stringify(meses)],
    queryFn: () => getCobranzasRepuestosAction({ sucursal, anio, meses }),
  });

  // Año completo — igual que presupuestosYtdData: los meses aún no cerrados en
  // el Excel vienen en $0 (ver CLAUDE.md), así que si "Participación por marca"
  // solo mirara el mes filtrado y ese mes fuera el actual (sin cerrar todavía),
  // el gráfico se quedaría sin datos que mostrar.
  const { data: detallesMarcas } = useQuery({
    queryKey: ["detalles-ventas-repuestos"],
    queryFn: () => getDetallesVentasRepuestosAction({ meses: "all" }),
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

  const companyMonthly = useMemo(() => {
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      ccv: 0,
      xibi: 0,
      estrategicas: 0,
    }));
    (presupuestosYtdData ?? []).forEach((p) => {
      const m = p.mes - 1;
      if (m >= 0 && m < 12) {
        byMonth[m].ccv += Number(p.ventasCcv || 0);
        byMonth[m].xibi += Number(p.ventasXibi || 0);
        byMonth[m].estrategicas += Number(p.ventasEstrategicas || 0);
      }
    });
    return byMonth.slice(0, getAllMonthsCap(anio));
  }, [presupuestosYtdData, anio]);

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

  // Top 7 marcas + "Otras marcas" agrupadas — 15 categorías individuales no
  // caben en un solo gráfico legible (ver skill dataviz: tope ~7-8 series
  // categóricas, doblar la cola en "Otras" en vez de generar más color).
  const porMarca = useMemo(() => {
    const map = new Map<string, number>();
    (detallesMarcas ?? []).forEach((d) => {
      map.set(d.marca, (map.get(d.marca) ?? 0) + Number(d.montoTotal || 0));
    });
    const all = Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = all.reduce((sum, r) => sum + r.value, 0);
    if (total === 0) return [];

    const TOP_N = 7;
    const top = all.slice(0, TOP_N);
    const rest = all.slice(TOP_N);
    const restTotal = rest.reduce((sum, r) => sum + r.value, 0);

    const rows = [...top];
    if (restTotal > 0) rows.push({ label: `Otras marcas (${rest.length})`, value: restTotal });

    return rows.map((r) => ({ ...r, pct: (r.value / total) * 100 }));
  }, [detallesMarcas]);

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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Unidad de Negocio"
          title="Dashboard de Repuestos"
          description="Facturación, cumplimiento presupuestario, marcas y cuentas por cobrar."
        />
        <PageSkeleton kpis={2} blocks={[{ cols: 6 }, { cols: 2, height: 260 }]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Unidad de Negocio"
        title="Dashboard de Repuestos"
        description="Facturación, cumplimiento presupuestario, marcas y cuentas por cobrar."
      />

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
          label="Top Marca"
          value={porMarca[0]?.label ?? "—"}
          hint={porMarca[0] ? money(porMarca[0].value) : "Sin datos"}
          accent="primary"
          icon={DollarSign}
        />
      </div>

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Desempeño por sucursal</h2>
          <p className="text-xs text-muted-foreground">
            Cumplimiento general, facturación por compañía y evolución mensual por compañía
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <ComplianceGauge
            title="Cumplimiento General Repuestos"
            pct={cumplimientoGeneral.pct}
            facturado={cumplimientoGeneral.facturado}
            presupuesto={cumplimientoGeneral.presupuesto}
          />
          <div className="lg:col-span-2">
            <UnitDonut data={porCompaniaData} title="Facturación por Compañía" />
          </div>
          <div className="lg:col-span-3">
            <CompanyMonthlyStackedLines data={companyMonthly} highlightMonths={highlightMonths} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Evolución mensual</h2>
          <p className="text-xs text-muted-foreground">
            Venta real vs. presupuesto, y venta por sucursal — año a la fecha, mes en revisión
            resaltado
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlobalMonthlyCombo data={monthlyCombo} highlightMonths={highlightMonths} />
          <SucursalPerformanceChart data={sucursalPerformanceData} />
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <header>
          <h2 className="font-display text-lg font-semibold">Ventas por marca</h2>
          <p className="text-xs text-muted-foreground">
            Top 7 marcas por monto facturado y su participación % del total — el resto agrupado en
            "Otras marcas"
          </p>
        </header>
        <RankedHorizontalBar
          title="Ventas por Marca"
          data={porMarca}
          emptyLabel="Sin datos por marca"
          valueFormatter={money}
        />
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Cuentas por cobrar</h2>
        </header>
        <ReceivablesTable
          rows={receivablesRows}
          sucursalOptions={role === "gerencia" ? sucursalOptions : undefined}
        />
      </section>

    </div>
  );
}
