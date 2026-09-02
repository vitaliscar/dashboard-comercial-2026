"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import {
  getServiciosAction,
  getPresupuestosServiciosAction,
  getServiciosInternoAction,
  getCobranzasServiciosAction,
  getServiciosTrendAction,
  getDetallesServiciosEstrategicosAction,
} from "@/lib/actions/servicios";
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
import { useMemo } from "react";
import { Zap, Wrench, User, TrendingUp } from "lucide-react";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { TalleresMonthlyChart } from "@/components/servicios/TalleresMonthlyChart";
import { CsaTrendChart } from "@/components/servicios/CsaTrendChart";
import { ClientesPotencialesSection } from "@/components/mercadeo/ClientesPotencialesSection";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function ServiciosPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const sucursalSel = filters.sucursales[0] ?? "all";

  const isCoordinador = role === "coordinador";
  const isGerencia = role === "gerencia";

  const sucursal = isCoordinador && profile?.sucursal_id ? profile.sucursal_id : sucursalSel;

  const canFilterSucursal = isGerencia;

  const { data: sucursales } = useSucursales();

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);
  const queryFilters = { anio, meses, sucursal };
  const filterKey = JSON.stringify(queryFilters);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursal ? [f.sucursal] : [],
    });
  };

  const { data: presupuestosData, isLoading: isLoadingPresupuestos } = useQuery({
    queryKey: ["presupuestos-servicios", filterKey, role, profile?.id],
    queryFn: () =>
      getPresupuestosServiciosAction({
        anio,
        meses,
        sucursal,
      }),
  });

  // Año completo (sin filtro de mes) para la evolución mensual, que siempre se
  // muestra hasta la fecha con el mes en revisión resaltado.
  const { data: presupuestosYtdData } = useQuery({
    queryKey: ["presupuestos-servicios-ytd", anio, sucursal, role, profile?.id],
    queryFn: () =>
      getPresupuestosServiciosAction({
        anio,
        meses: "all",
        sucursal,
      }),
  });

  const { data: serviciosInternoData, isLoading: isLoadingServiciosInterno } = useQuery({
    queryKey: ["servicios-interno", JSON.stringify(meses)],
    queryFn: () => getServiciosInternoAction({ meses }),
  });

  const { data: servicios, isLoading: isLoadingServicios } = useQuery({
    queryKey: ["servicios", filterKey, role, profile?.id],
    queryFn: () => getServiciosAction({ ranges: dateRanges, sucursal }),
  });

  const { data: cobranzasData } = useQuery({
    queryKey: ["cobranzas-servicios", filterKey, role, profile?.id],
    queryFn: () => getCobranzasServiciosAction({ sucursal }),
  });

  const { data: trend } = useQuery({
    queryKey: ["servicios-trend", anio, sucursal, JSON.stringify(meses), role, profile?.id],
    queryFn: () => getServiciosTrendAction({ anio, meses, sucursal }),
  });

  const { data: detallesEstrategicos } = useQuery({
    queryKey: ["detalles-servicios-estrategicos", JSON.stringify(meses), sucursal],
    queryFn: () => getDetallesServiciosEstrategicosAction({ meses, sucursal }),
  });

  const ventasInternasTotal = useMemo(() => {
    if (!serviciosInternoData) return 0;
    return serviciosInternoData.reduce((sum, s) => sum + Number(s.monto || 0), 0);
  }, [serviciosInternoData]);

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

  const totales = useMemo(() => {
    if (!servicios) return { ventas_talleres: 0, ventas_csa: 0 };

    let ventas_talleres = 0;
    let ventas_csa = 0;

    servicios.forEach((s) => {
      const val = Number(s.monto) || 0;
      const cat = (s.categoriaVenta ?? "").toUpperCase();
      const tallerStr = (s.taller ?? "").trim().toUpperCase();
      const csaStr = (s.csa ?? "").trim().toUpperCase();

      if (csaStr === "CSA" || cat.includes("CSA")) {
        ventas_csa += val;
      }
      if (tallerStr.length > 0) {
        ventas_talleres += val;
      }
    });

    return {
      ventas_talleres,
      ventas_csa,
    };
  }, [servicios]);

  const trendData = useMemo(() => {
    const byMonthCombo = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      presupuesto: 0,
      venta: 0,
    }));

    (presupuestosYtdData ?? []).forEach((p) => {
      const m = p.mes - 1;
      if (m >= 0 && m < 12) {
        byMonthCombo[m].presupuesto += Number(p.monto || 0);
        byMonthCombo[m].venta +=
          Number(p.ventasCcv || 0) + Number(p.ventasXibi || 0) + Number(p.ventasEstrategicas || 0);
      }
    });

    const byMonthWorkshops = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      CRM: 0,
      CNRC: 0,
      MachineShop: 0,
    }));

    const byMonthCsa = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      monto: 0,
    }));

    (trend ?? []).forEach((r) => {
      const parts = String(r.fecha).split("-");
      const m = parts.length >= 2 ? parseInt(parts[1], 10) - 1 : new Date(r.fecha).getMonth();
      if (m >= 0 && m < 12) {
        const val = Number(r.monto);

        const tallerStr = (r.taller ?? "").trim().toUpperCase();
        if (tallerStr.includes("CRM")) byMonthWorkshops[m].CRM += val;
        else if (tallerStr.includes("CNRC")) byMonthWorkshops[m].CNRC += val;
        else if (tallerStr.includes("MACHINE SHOP")) byMonthWorkshops[m].MachineShop += val;

        const csaStr = (r.csa ?? "").trim().toUpperCase();
        if (csaStr === "CSA" || (r.categoriaVenta ?? "").toUpperCase().includes("CSA")) {
          byMonthCsa[m].monto += val;
        }
      }
    });

    const cap = getAllMonthsCap(anio);

    return {
      monthlyCombo: byMonthCombo.slice(0, cap),
      workshopsMonthly: byMonthWorkshops.slice(0, cap),
      csaMonthly: byMonthCsa.slice(0, cap),
    };
  }, [presupuestosYtdData, trend, anio]);

  const selectedMonthLabels = useMemo(() => getHighlightMonthLabels(meses), [meses]);

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

  const porSucursalData = useMemo(() => {
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
      .sort((a, b) => b.monto - a.monto);
  }, [presupuestosData, sucursales]);

  const sucursalPerformanceData = useMemo(() => {
    return porSucursalData.map((s) => ({
      nombre: s.nombre,
      monto: s.monto,
      presupuesto: s.presupuesto,
      pctCumplimiento: s.presupuesto > 0 ? (s.monto / s.presupuesto) * 100 : 0,
    }));
  }, [porSucursalData]);

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

  const porTipoServicio = useMemo(() => {
    if (!servicios) return [];
    const map = new Map<string, number>();
    servicios.forEach((s) => {
      const tipo = s.tipoServicio || "Sin Clasificar";
      map.set(tipo, (map.get(tipo) ?? 0) + Number(s.monto || 0));
    });
    return Array.from(map.entries())
      .map(([tipo, monto]) => ({ tipo, monto }))
      .filter((t) => t.monto !== 0)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);
  }, [servicios]);

  const strategicServiceData = useMemo(() => {
    if (!detallesEstrategicos) return [];
    const map = new Map<string, number>();
    detallesEstrategicos.forEach((d) => {
      map.set(d.tipoServicio, (map.get(d.tipoServicio) ?? 0) + Number(d.monto));
    });
    return Array.from(map.entries()).map(([tipoServicio, monto]) => ({
      tipoServicio,
      monto,
    }));
  }, [detallesEstrategicos]);

  const sucursalMap = useMemo(() => {
    const map = new Map<string, string>();
    (sucursales ?? []).forEach((s) => map.set(s.id, s.nombre));
    return map;
  }, [sucursales]);

  const sucursalOptions = useMemo(() => {
    return (sucursales ?? [])
      .filter((s) => s.nombre !== "Machine Shop")
      .map((s) => ({ value: s.nombre, label: s.nombre }));
  }, [sucursales]);

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

  // Guard de rol DESPUÉS de todos los hooks de React
  if (role !== "gerencia" && role !== "gerente_comercial" && role !== "coordinador") {
    return null;
  }

  const isLoading = isLoadingServicios || isLoadingPresupuestos || isLoadingServiciosInterno;

  if (isLoading && !presupuestosData) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Dashboard de Servicios</h1>
        </div>
        <PageSkeleton
          kpis={4}
          blocks={[{ cols: 6 }, { cols: 1 }, { cols: 2 }, { cols: 2 }, { cols: 1, height: 260 }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard de Servicios</h1>
      </div>

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={
          canFilterSucursal
            ? sucursales
                ?.filter((s) => s.nombre !== "Machine Shop")
                .map((s) => ({ value: s.id, label: s.nombre }))
            : undefined
        }
        defaultMes={meses}
        defaultAnio={anio}
        showAllMonths
      />

      {/* KPI Cards — 4 totales sin solaparse: consolidado = talleres + CSA + internas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          hint="Total facturado: talleres + CSA + ventas internas"
        />
        <KpiCard
          label="Ventas Talleres"
          value={money(totales.ventas_talleres)}
          accent="success"
          icon={Wrench}
          hint="CRM, CNRC y Machine Shop"
        />
        <KpiCard
          label="Ventas CSA"
          value={money(totales.ventas_csa)}
          accent="warning"
          icon={User}
          hint="Servicio de asistencia al cliente"
        />
        <KpiCard
          label="Ventas Internas"
          value={money(ventasInternasTotal)}
          accent="primary"
          icon={Zap}
          hint="Facturado entre unidades CCV"
        />
      </div>

      {/* Sección 1: desempeño por sucursal — gauge (headline) + compañía + ranking */}
      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Desempeño por sucursal</h2>
          <p className="text-xs text-muted-foreground">
            Cumplimiento general, facturación por compañía y detalle por sucursal, ordenado de mejor
            a peor
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <ComplianceGauge
            title="Cumplimiento General Servicios"
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

      {/* Sección 2: evolución mensual — único gráfico de tendencia, sin repetir por sucursal */}
      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Evolución mensual</h2>
          <p className="text-xs text-muted-foreground">
            Venta real vs. presupuesto, año a la fecha — mes en revisión resaltado
          </p>
        </header>
        <GlobalMonthlyCombo data={trendData.monthlyCombo} highlightMonths={selectedMonthLabels} />
      </section>

      {/* Sección 3: composición de ingresos — de dónde viene la venta */}
      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <header>
          <h2 className="font-display text-lg font-semibold">Composición de ingresos</h2>
          <p className="text-xs text-muted-foreground">Por tipo de servicio y línea estratégica</p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankedHorizontalBar
            title="Monto por Tipo de Servicio"
            data={porTipoServicio.map((t) => ({ label: t.tipo, value: t.monto }))}
            emptyLabel="Sin datos por tipo de servicio"
            valueFormatter={money}
          />
          <RankedHorizontalBar
            title="Tipo Servicio Estratégico"
            data={strategicServiceData.map((s) => ({ label: s.tipoServicio, value: s.monto }))}
            emptyLabel="Sin datos estratégicos"
            valueFormatter={money}
            barColor="var(--color-chart-calm-3)"
          />
        </div>
      </section>

      {/* Sección 4: talleres y CSA — composición mensual + tendencia */}
      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Talleres y CSA</h2>
          <p className="text-xs text-muted-foreground">
            Mezcla mensual por taller y tendencia de CSA
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TalleresMonthlyChart
            data={trendData.workshopsMonthly}
            selectedMonths={selectedMonthLabels}
          />
          <CsaTrendChart data={trendData.csaMonthly} selectedMonths={selectedMonthLabels} />
        </div>
      </section>

      {/* Sección 5: cartera */}
      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <header>
          <h2 className="font-display text-lg font-semibold">Cuentas por cobrar</h2>
        </header>
        <ReceivablesTable rows={receivablesRows} sucursalOptions={sucursalOptions} />
      </section>

      <ClientesPotencialesSection unidad="Servicios" />

      {isLoading && (
        <div className="text-xs text-muted-foreground">Cargando datos de servicio…</div>
      )}
    </div>
  );
}
