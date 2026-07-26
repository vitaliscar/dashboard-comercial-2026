"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
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
import { getDateRangesForMonths, getAllMonthsCap } from "@/lib/date-range";
import { useMemo } from "react";
import { Zap, Wrench, User, TrendingUp } from "lucide-react";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { ServiciosEstrategicosChart } from "@/components/servicios/ServiciosEstrategicosChart";
import { TalleresMonthlyChart } from "@/components/servicios/TalleresMonthlyChart";
import { CsaTrendChart } from "@/components/servicios/CsaTrendChart";
import { CompliancePyramid } from "@/components/servicios/CompliancePyramid";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function ServiciosPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;
  const sucursalSel = filters.sucursales[0] ?? "all";

  const isGC = role === "gerente_comercial";
  const isCoordinador = role === "coordinador";
  const isGerencia = role === "gerencia";

  const unidadesSeleccionadas =
    isGC && profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : selectedUnidades;
  const sucursal = isCoordinador && profile?.sucursal_id ? profile.sucursal_id : sucursalSel;

  const canFilterSucursal = isGerencia;
  const canFilterUnidad = isGerencia;

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);
  const queryFilters = { anio, meses, sucursal, unidadesSeleccionadas };
  const filterKey = JSON.stringify(queryFilters);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursal ? [f.sucursal] : [],
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
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

  const { data: serviciosInternoData, isLoading: isLoadingServiciosInterno } = useQuery({
    queryKey: ["servicios-interno", JSON.stringify(meses)],
    queryFn: () => getServiciosInternoAction({ meses }),
  });

  const { data: servicios, isLoading: isLoadingServicios } = useQuery({
    queryKey: ["servicios", filterKey, role, profile?.id],
    queryFn: () =>
      getServiciosAction({ ranges: dateRanges, sucursal, unidades: unidadesSeleccionadas }),
  });

  const { data: cobranzasData } = useQuery({
    queryKey: ["cobranzas-servicios", filterKey, role, profile?.id],
    queryFn: () => getCobranzasServiciosAction({ sucursal }),
  });

  const { data: trend } = useQuery({
    queryKey: [
      "servicios-trend",
      anio,
      sucursal,
      unidadesSeleccionadas,
      JSON.stringify(meses),
      role,
      profile?.id,
    ],
    queryFn: () =>
      getServiciosTrendAction({
        anio,
        meses,
        sucursal,
        unidades: unidadesSeleccionadas,
      }),
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

    (presupuestosData ?? []).forEach((p) => {
      const m = p.mes - 1;
      if (m >= 0 && m < 12) {
        byMonthCombo[m].presupuesto += Number(p.monto || 0);
        byMonthCombo[m].venta +=
          Number(p.ventasCcv || 0) +
          Number(p.ventasXibi || 0) +
          Number(p.ventasEstrategicas || 0);
      }
    });

    const byMonthWorkshops = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      CRM: 0,
      CNRC: 0,
      VMS: 0,
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
        else if (tallerStr.includes("VMS")) byMonthWorkshops[m].VMS += val;

        const csaStr = (r.csa ?? "").trim().toUpperCase();
        if (csaStr === "CSA" || (r.categoriaVenta ?? "").toUpperCase().includes("CSA")) {
          byMonthCsa[m].monto += val;
        }
      }
    });

    const filterMonthly = <T extends { mes: string }>(items: T[]) => {
      if (meses !== "all") {
        const allowed = meses.map((m) => MESES[m - 1].slice(0, 3));
        return items.filter((item) => allowed.includes(item.mes));
      }
      const cap = getAllMonthsCap(anio);
      return items.slice(0, cap);
    };

    return {
      monthlyCombo: filterMonthly(byMonthCombo),
      workshopsMonthly: filterMonthly(byMonthWorkshops),
      csaMonthly: filterMonthly(byMonthCsa),
    };
  }, [presupuestosData, trend, anio, meses]);

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
          Number(r.ventasCcv || 0) +
          Number(r.ventasXibi || 0) +
          Number(r.ventasEstrategicas || 0);
        item.presupuesto += Number(r.monto || 0);
      }
    });

    return Array.from(map.values())
      .filter((r) => r.monto > 0 || r.presupuesto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [presupuestosData, sucursales]);

  const compliancePyramidData = useMemo(() => {
    return porSucursalData.map((s) => ({
      nombre: s.nombre,
      presupuesto: s.presupuesto,
      venta: s.monto,
      pctCumplimiento: s.presupuesto > 0 ? (s.monto / s.presupuesto) * 100 : 0,
    }));
  }, [porSucursalData]);

  const porTipoServicio = useMemo(() => {
    if (!servicios) return [];
    const map = new Map<string, number>();
    servicios.forEach((s) => {
      const tipo = s.tipoServicio || "Sin Clasificar";
      map.set(tipo, (map.get(tipo) ?? 0) + Number(s.monto || 0));
    });
    return Array.from(map.entries())
      .map(([tipo, monto]) => ({ tipo, monto }))
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

  const unitOptions = useMemo(() => {
    return (unidades ?? []).map((u) => ({ value: u.id, label: u.nombre.toUpperCase() }));
  }, [unidades]);

  const receivablesRows = useMemo(() => {
    if (!cobranzasData) return [];
    return cobranzasData.map((c) => ({
      id: c.id,
      sucursalVenta: c.sucursalId ? sucursalMap.get(c.sucursalId) || "Sin sucursal" : "Sin sucursal",
      cliente: c.cliente,
      unidadId: c.unidadNegocioId ?? undefined,
      diasVencidos: c.diasVencidos ?? 0,
      total: Number(c.saldo),
    }));
  }, [cobranzasData, sucursalMap]);

  // Guard de rol DESPUÉS de todos los hooks de React
  if (role !== "gerencia" && role !== "gerente_comercial" && role !== "coordinador") {
    return null;
  }

  const isLoading = isLoadingServicios || isLoadingPresupuestos || isLoadingServiciosInterno;

  return (
    <div className="flex flex-col gap-6 max-w-400">
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
        unitOptions={
          canFilterUnidad
            ? unidades?.map((u) => ({ value: u.id, label: u.nombre.toUpperCase() }))
            : undefined
        }
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={unidadesSeleccionadas}
        showAllMonths
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ventas Consolidadas"
          value={money(ventasConsolidadasTotal)}
          accent="ochre"
          icon={TrendingUp}
          hint={`${presupuestosData?.length ?? 0} registros presupuestarios`}
        />
        <KpiCard
          label="Ventas Internas"
          value={money(ventasInternasTotal)}
          accent="primary"
          icon={Zap}
        />
        <KpiCard
          label="Ventas Talleres"
          value={money(totales.ventas_talleres)}
          accent="success"
          icon={Wrench}
        />
        <KpiCard
          label="Ventas CSA"
          value={money(totales.ventas_csa)}
          accent="warning"
          icon={User}
        />
      </div>

      {/* Bloque 1: Ventas Mensuales Servicios (nacional) */}
      <GlobalMonthlyCombo data={trendData.monthlyCombo} />

      {/* Bloque 2: Distribución y Compañías */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <UnitDonut data={porCompaniaData} title="Facturación por Compañía" />
        <div className="card-elevated p-5 flex flex-col h-full">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Facturación por Sucursal Servicios</h3>
            <p className="text-xs text-muted-foreground">Ordenado de mayor a menor</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={porSucursalData}
                layout="vertical"
                margin={{ top: 10, right: 45, left: 10, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  dataKey="nombre"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={100}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <UnitDonut
          data={porSucursalData.map((s) => ({ label: s.nombre, facturado: s.monto }))}
          title="Participación Ventas"
        />
      </div>

      {/* Bloque 3: Presupuesto vs Cumplimiento por Sucursal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-elevated p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Presu. vs Cump. Mensual Servicios</h3>
            <p className="text-xs text-muted-foreground">Ventas y presupuesto por sucursal</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porSucursalData} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="nombre" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" name="Ventas Totales" fill="var(--color-chart-calm-1)" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="monto"
                    position="top"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--color-foreground)"
                    formatter={((v: unknown) => money(Number(v))) as never}
                  />
                </Bar>
                <Line
                  type="monotone"
                  dataKey="presupuesto"
                  name="Presupuesto"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "var(--color-card)", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <CompliancePyramid data={compliancePyramidData} title="Porcentaje Cumplimiento Sucursal" />
      </div>

      {/* Bloque 4: Servicios y Talleres */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card-elevated p-5 flex flex-col h-full">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Monto por Tipo de Servicio</h3>
            <p className="text-xs text-muted-foreground">M/O Directa, Misceláneos, Subcontrato, M/O Subcon</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porTipoServicio}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="tipo"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <ServiciosEstrategicosChart data={strategicServiceData} />
        <TalleresMonthlyChart data={trendData.workshopsMonthly} />
        <CsaTrendChart data={trendData.csaMonthly} />
      </div>

      {/* Bloque 4: Cuentas por Cobrar */}
      <ReceivablesTable
        rows={receivablesRows}
        unitOptions={unitOptions}
        sucursalOptions={sucursalOptions}
      />

      {isLoading && (
        <div className="text-xs text-muted-foreground">Cargando datos de servicio…</div>
      )}
    </div>
  );
}
