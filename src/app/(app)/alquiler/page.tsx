"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getAllMonthsCap, getHighlightMonthLabels } from "@/lib/date-range";
import {
  getPresupuestosAlquilerAction,
  getAlquilerClientesCobroAction,
} from "@/lib/actions/alquiler";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { useMemo, useState } from "react";
import { TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { ClientesPotencialesSection } from "@/components/mercadeo/ClientesPotencialesSection";

export default function Alquiler() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const sucursal = filters.sucursales[0] ?? "all";
  const [searchClientes, setSearchClientes] = useState("");

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses, sucursales: f.sucursal ? [f.sucursal] : [] });
  };

  const { data: sucursales } = useSucursales();

  const { data: presupuestosData, isLoading } = useQuery({
    queryKey: ["presupuestos-alquiler", anio, JSON.stringify(meses), sucursal],
    queryFn: () => getPresupuestosAlquilerAction({ anio, meses, sucursal }),
  });

  // Año completo (sin filtro de mes) para la evolución mensual, que siempre se
  // muestra hasta la fecha con el mes en revisión resaltado.
  const { data: presupuestosYtdData } = useQuery({
    queryKey: ["presupuestos-alquiler-ytd", anio, sucursal],
    queryFn: () => getPresupuestosAlquilerAction({ anio, meses: "all", sucursal }),
  });

  const { data: clientesCobro } = useQuery({
    queryKey: ["alquiler-clientes-cobro"],
    queryFn: () => getAlquilerClientesCobroAction(),
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

  const clientesFiltrados = useMemo(() => {
    const s = searchClientes.toLowerCase();
    return (clientesCobro ?? [])
      .filter((r) => r.cliente.toLowerCase().includes(s))
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
  }, [clientesCobro, searchClientes]);

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Unidad de Negocio"
        title="Dashboard Comercial - Alquiler"
        description="Seguimiento de facturación, cumplimiento presupuestario y cuentas por cobrar por cliente."
      />

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

      <KpiCard
        label="Ventas Consolidadas"
        value={money(ventasConsolidadasTotal)}
        accent="ochre"
        icon={TrendingUp}
        hint="Total facturado CCV + Xibi + Estratégicas"
      />

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <header>
          <h2 className="font-display text-lg font-semibold">Desempeño por sucursal</h2>
          <p className="text-xs text-muted-foreground">
            Cumplimiento general, facturación por compañía y detalle por sucursal
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <ComplianceGauge
            title="Cumplimiento General Alquiler"
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
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Cuentas por cobrar</h2>
            <p className="text-xs text-muted-foreground">Saldos pendientes de alquiler</p>
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
            cliente: r.cliente,
            sucursalVenta: sucursales?.find((s) => s.id === r.sucursalId)?.nombre,
            total: Number(r.saldo),
          }))}
        />
      </section>

      <ClientesPotencialesSection unidad="Alquiler" />

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
