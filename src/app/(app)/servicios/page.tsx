"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getServiciosAction,
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
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
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

  const totales = useMemo(() => {
    if (!servicios) return { ventas_internas: 0, ventas_talleres: 0, ventas_csa: 0, total: 0 };

    let ventas_internas = 0;
    let ventas_talleres = 0;
    let ventas_csa = 0;
    let total = 0;

    servicios.forEach((s) => {
      const val = Number(s.monto) || 0;
      total += val;

      const cat = (s.categoriaVenta ?? "").toUpperCase();
      const tallerStr = (s.taller ?? "").trim().toUpperCase();
      const csaStr = (s.csa ?? "").trim().toUpperCase();

      if (csaStr === "CSA" || cat.includes("CSA")) {
        ventas_csa += val;
      }
      if (tallerStr.length > 0) {
        ventas_talleres += val;
      }
      if (cat === "INTERNO" || cat.includes("INTERN")) {
        ventas_internas += val;
      }
    });

    return {
      ventas_internas,
      ventas_talleres,
      ventas_csa,
      total,
    };
  }, [servicios]);

  const trendData = useMemo(() => {
    if (!trend) return { monthlyCombo: [], workshopsMonthly: [], csaMonthly: [] };

    const byMonthCombo = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i].slice(0, 3),
      presupuesto: 0,
      venta: 0,
    }));

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

    trend.forEach((r) => {
      const parts = String(r.fecha).split("-");
      const m = parts.length >= 2 ? parseInt(parts[1], 10) - 1 : new Date(r.fecha).getMonth();
      if (m >= 0 && m < 12) {
        const val = Number(r.monto);
        byMonthCombo[m].venta += val;

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
  }, [trend, anio, meses]);

  const porCompaniaData = useMemo(() => {
    const map = new Map<string, number>();
    (servicios ?? []).forEach((s) => {
      const comp = s.compania || "Consorcio Venequip";
      map.set(comp, (map.get(comp) ?? 0) + Number(s.monto));
    });
    return Array.from(map.entries())
      .map(([label, facturado]) => ({ label, facturado }))
      .sort((a, b) => b.facturado - a.facturado);
  }, [servicios]);

  const porSucursalData = useMemo(() => {
    if (!servicios || !sucursales) return [];
    const map = new Map<string, { nombre: string; monto: number }>();
    sucursales.forEach((s) => map.set(s.id, { nombre: s.nombre, monto: 0 }));
    servicios.forEach((r) => {
      if (r.sucursalId && map.has(r.sucursalId)) {
        map.get(r.sucursalId)!.monto += Number(r.monto);
      }
    });
    return Array.from(map.values())
      .filter((r) => r.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [servicios, sucursales]);

  const compliancePyramidData = useMemo(() => {
    return porSucursalData.map((s) => ({
      nombre: s.nombre,
      presupuesto: s.monto * 1.1, // Presupuesto estimado para porcentaje
      venta: s.monto,
      pctCumplimiento: 90.9,
    }));
  }, [porSucursalData]);

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

  const porTipoServicio = useMemo(() => {
    const map = new Map<string, number>();
    (servicios ?? []).forEach((s) => {
      const tipo = s.tipoServicio || "General";
      map.set(tipo, (map.get(tipo) ?? 0) + Number(s.monto));
    });
    return Array.from(map.entries())
      .map(([tipo, monto]) => ({ tipo, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);
  }, [servicios]);

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
          value={money(totales.total)}
          accent="ochre"
          icon={TrendingUp}
          hint={`${servicios?.length ?? 0} servicios facturados`}
        />
        <KpiCard
          label="Ventas Internas"
          value={money(totales.ventas_internas)}
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

      {/* Bloque 1: Rendimiento y Presupuesto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GlobalMonthlyCombo data={trendData.monthlyCombo} />
        </div>
        <div>
          <CompliancePyramid data={compliancePyramidData} />
        </div>
      </div>

      {/* Bloque 2: Distribución y Compañías */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnitDonut data={porCompaniaData} title="Distribución por Compañía" />
        <div className="card-elevated p-5 flex flex-col h-full">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Facturación por Sucursal</h3>
            <p className="text-xs text-muted-foreground">Monto total por sucursal</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porSucursalData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="nombre" stroke="var(--color-muted-foreground)" fontSize={11} />
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
                <Bar dataKey="monto" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bloque 3: Servicios y Talleres */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TalleresMonthlyChart data={trendData.workshopsMonthly} />
        <ServiciosEstrategicosChart data={strategicServiceData} />
        <CsaTrendChart data={trendData.csaMonthly} />
      </div>

      {/* Bloque 4: Cuentas por Cobrar */}
      <ReceivablesTable
        rows={receivablesRows}
        unitOptions={unitOptions}
        sucursalOptions={sucursalOptions}
      />

      {isLoadingServicios && (
        <div className="text-xs text-muted-foreground">Cargando datos de servicio…</div>
      )}
    </div>
  );
}
