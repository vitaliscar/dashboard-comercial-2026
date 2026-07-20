import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { MESES } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import {
  getDateRangesForMonths,
  applyDateRangesToQuery,
  applyMonthFilterToQuery,
  getAllMonthsCap,
} from "@/lib/date-range";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { CompanyTrendChart } from "@/components/coordinador/CompanyTrendChart";
import { UnitAmountBars } from "@/components/coordinador/UnitAmountBars";
import { GlobalMonthlyCombo, type MonthlyRow } from "@/components/coordinador/GlobalMonthlyCombo";
import { RepuestosAreaChart } from "@/components/coordinador/RepuestosAreaChart";
import { ServiciosBarWithMarkers } from "@/components/coordinador/ServiciosBarWithMarkers";
import { LubFiltrosComboLines } from "@/components/coordinador/LubFiltrosComboLines";
import {
  EquiposAlquilerStacked,
  type EquiposAlquilerRow,
} from "@/components/coordinador/EquiposAlquilerStacked";
import { ReceivablesTable, type ReceivableRow } from "@/components/coordinador/ReceivablesTable";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { useMemo, useEffect, useDeferredValue } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolverAsesor, normalizarNombre, VENTAS_CASA } from "@/lib/asesores-catalogo";

export const Route = createFileRoute("/_app/coordinador")({
  head: () => ({ meta: [{ title: "Panel Coordinador · CCV" }] }),
  component: CoordinadorPanel,
});

type Acc = {
  facturado: number;
  presupuesto: number;
  ccv: number;
  xibi: number;
  estrategicas: number;
};
const emptyMonth = (): Acc => ({ facturado: 0, presupuesto: 0, ccv: 0, xibi: 0, estrategicas: 0 });
const emptyYear = (): Acc[] => Array.from({ length: 12 }, emptyMonth);

function combineUnits(perUnit: Map<string, Acc[]>, ids: string[]): Acc[] {
  const result = emptyYear();
  ids.forEach((id) => {
    const arr = perUnit.get(id);
    if (!arr) return;
    arr.forEach((m, i) => {
      result[i].facturado += m.facturado;
      result[i].presupuesto += m.presupuesto;
      result[i].ccv += m.ccv;
      result[i].xibi += m.xibi;
      result[i].estrategicas += m.estrategicas;
    });
  });
  return result;
}

function CoordinadorPanel() {
  const { role, profile } = useAuth();
  const canView = role === "coordinador";

  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focus is on form inputs
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      const today = new Date();
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (meses === "all") {
          setFilters({ ...filters, meses: [12] });
        } else {
          const currentMes = meses[0] ?? today.getMonth() + 1;
          if (currentMes > 1) {
            setFilters({ ...filters, meses: [currentMes - 1] });
          } else {
            setFilters({ ...filters, meses: [12], anio: anio - 1 });
          }
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (meses === "all") {
          setFilters({ ...filters, meses: [1] });
        } else {
          const currentMes = meses[0] ?? today.getMonth() + 1;
          if (currentMes < 12) {
            setFilters({ ...filters, meses: [currentMes + 1] });
          } else {
            setFilters({ ...filters, meses: [1], anio: anio + 1 });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filters, anio, meses, setFilters]);

  const { data: unidades } = useUnidades();

  // Full-year presupuestos for this coordinador's sucursal (scoped() pins it). "Facturado" comes
  // from ventas_ccv/xibi/estrategicas, not the facturas table — same source of truth resumen.tsx
  // uses; facturas is not reconciled and undercounts.
  const { data: yearData, isLoading } = useQuery({
    queryKey: ["coordinador-year", anio, profile?.sucursal_id],
    enabled: canView,
    queryFn: async () => {
      const pq = scoped(
        supabase
          .from("presupuestos")
          .select("monto, mes, unidad_negocio_id, ventas_ccv, ventas_xibi, ventas_estrategicas")
          .eq("anio", anio),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id" },
      );
      const { data } = await pq;
      return { presupuestos: data ?? [] };
    },
  });

  // Outstanding receivables for this sucursal.
  const { data: cobranzasData } = useQuery({
    queryKey: ["coordinador-cobranzas", profile?.sucursal_id],
    enabled: canView,
    queryFn: async () => {
      const q = scoped(
        supabase
          .from("cobranzas")
          .select("cliente, monto, saldo, unidad_negocio_id")
          .gt("saldo", 0),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id" },
      );
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: asesorScoreData } = useQuery({
    queryKey: [
      "coordinador-scorecard",
      anio,
      JSON.stringify(meses),
      profile?.sucursal_id,
      selectedUnidades,
    ],
    enabled: canView,
    queryFn: async () => {
      let cq = scoped(
        supabase.from("cotizaciones").select("asesor_codigo, monto"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      cq = applyDateRangesToQuery(cq, dateRanges);

      let fq = scoped(
        supabase.from("facturas").select("asesor, monto"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      fq = applyDateRangesToQuery(fq, dateRanges);

      let mq = scoped(
        supabase.from("minutas").select("responsable, estado"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "responsable_id" },
      );
      mq = applyDateRangesToQuery(mq, dateRanges);

      let aq = scoped(
        supabase
          .from("cumplimiento_asesores")
          .select("codigo_asesor, asesor, venta, pct_cumplimiento, pct_participacion")
          .eq("anio", anio),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      aq = applyMonthFilterToQuery(aq, meses, anio);

      if (selectedUnidades.length > 0) {
        cq = cq.in("unidad_negocio_id", selectedUnidades);
        fq = fq.in("unidad_negocio_id", selectedUnidades);
        mq = mq.in("unidad_negocio_id", selectedUnidades);
        aq = aq.in("unidad_negocio_id", selectedUnidades);
      }

      const [c, f, m, a] = await Promise.all([cq, fq, mq, aq]);
      return {
        cotizaciones: c.data ?? [],
        facturas: f.data ?? [],
        minutas: m.data ?? [],
        asesores: a.data ?? [],
      };
    },
  });

  const monthlyData = useMemo(() => {
    const perUnit = new Map<string, Acc[]>();
    const ensure = (id: string) => {
      if (!perUnit.has(id)) perUnit.set(id, emptyYear());
      return perUnit.get(id)!;
    };

    (yearData?.presupuestos ?? []).forEach((r) => {
      if (!r.unidad_negocio_id) return;
      const m = r.mes - 1;
      if (m < 0 || m > 11) return;
      const acc = ensure(r.unidad_negocio_id)[m];
      const ccv = Number(r.ventas_ccv ?? 0);
      const xibi = Number(r.ventas_xibi ?? 0);
      const estrategicas = Number(r.ventas_estrategicas ?? 0);
      acc.presupuesto += Number(r.monto ?? 0);
      acc.ccv += ccv;
      acc.xibi += xibi;
      acc.estrategicas += estrategicas;
      acc.facturado += ccv + xibi + estrategicas;
    });

    return perUnit;
  }, [yearData]);

  const unitIdsByLabel = useMemo(() => {
    const map = new Map<string, string[]>();
    (unidades ?? []).forEach((u) => {
      const { label } = unidadLabelInfo(u.nombre);
      map.set(label, [...(map.get(label) ?? []), u.id]);
    });
    return map;
  }, [unidades]);

  const allUnitIds = useMemo(() => (unidades ?? []).map((u) => u.id), [unidades]);
  const effectiveUnitIds = selectedUnidades.length > 0 ? selectedUnidades : allUnitIds;

  const monthsInScope = useMemo(() => {
    if (meses !== "all") {
      return meses.map((m) => m - 1);
    }
    const cap = getAllMonthsCap(anio);
    return Array.from({ length: cap }, (_, i) => i);
  }, [meses, anio]);

  // Row 1 — current-period snapshots (respect mes + unit chip filter).
  const currentPeriodCompania = useMemo(() => {
    let ccv = 0,
      xibi = 0,
      estrategicas = 0;
    effectiveUnitIds.forEach((id) => {
      const arr = monthlyData.get(id);
      if (!arr) return;
      monthsInScope.forEach((m) => {
        ccv += arr[m].ccv;
        xibi += arr[m].xibi;
        estrategicas += arr[m].estrategicas;
      });
    });
    return [
      { label: "CCV", facturado: ccv },
      { label: "Xibi", facturado: xibi },
      { label: "Ventas Estratégicas", facturado: estrategicas },
    ].filter((r) => r.facturado > 0);
  }, [effectiveUnitIds, monthlyData, monthsInScope]);

  const currentPeriodByUnit = useMemo(() => {
    return (unidades ?? [])
      .filter((u) => effectiveUnitIds.includes(u.id))
      .map((u) => {
        const arr = monthlyData.get(u.id) ?? emptyYear();
        const facturado = monthsInScope.reduce((a, m) => a + arr[m].facturado, 0);
        const presupuesto = monthsInScope.reduce((a, m) => a + arr[m].presupuesto, 0);
        const cumplimiento = presupuesto > 0 ? (facturado / presupuesto) * 100 : 0;
        return { label: unidadLabelInfo(u.nombre).label, facturado, cumplimiento };
      })
      .filter((r) => r.facturado > 0)
      .sort((a, b) => b.facturado - a.facturado);
  }, [unidades, effectiveUnitIds, monthlyData, monthsInScope]);

  // Row 1/2 — H1 (Enero-Junio) trend series, respecting the unit chip filter where it applies.
  const h1Labels = MESES.slice(0, 6);
  const scopedGlobal = useMemo(
    () => combineUnits(monthlyData, effectiveUnitIds),
    [monthlyData, effectiveUnitIds],
  );

  // Row 1 — overall compliance gauge for the current period (mes + unit chip filter).
  const currentPeriodTotals = useMemo(() => {
    const facturado = monthsInScope.reduce((a, m) => a + scopedGlobal[m].facturado, 0);
    const presupuesto = monthsInScope.reduce((a, m) => a + scopedGlobal[m].presupuesto, 0);
    const cumplimiento = presupuesto > 0 ? (facturado / presupuesto) * 100 : 0;
    return { facturado, presupuesto, cumplimiento };
  }, [scopedGlobal, monthsInScope]);

  const companyTrend = useMemo(
    () =>
      h1Labels.map((mesLabel, i) => ({
        mes: mesLabel,
        ccv: scopedGlobal[i].ccv,
        xibi: scopedGlobal[i].xibi,
        estrategicas: scopedGlobal[i].estrategicas,
      })),
    [scopedGlobal, h1Labels],
  );

  const globalTrend: MonthlyRow[] = useMemo(
    () =>
      h1Labels.map((mesLabel, i) => ({
        mes: mesLabel,
        presupuesto: scopedGlobal[i].presupuesto,
        venta: scopedGlobal[i].facturado,
      })),
    [scopedGlobal, h1Labels],
  );

  // Row 2/3 — dedicated single/paired-unit trends, always full-picture (ignore the chip filter).
  const trendForLabel = (label: string): MonthlyRow[] => {
    const ids = unitIdsByLabel.get(label) ?? [];
    const combined = combineUnits(monthlyData, ids);
    return h1Labels.map((mesLabel, i) => ({
      mes: mesLabel,
      presupuesto: combined[i].presupuesto,
      venta: combined[i].facturado,
    }));
  };
  const repuestosTrend = trendForLabel("Repuestos");
  const serviciosTrend = trendForLabel("Servicios");
  const lubFiltrosTrend = trendForLabel("Lub / Filtros");

  const equiposAlquilerTrend: EquiposAlquilerRow[] = useMemo(() => {
    const equiposIds = unitIdsByLabel.get("Equipos") ?? [];
    const alquilerIds = unitIdsByLabel.get("Alquiler") ?? [];
    const equipos = combineUnits(monthlyData, equiposIds);
    const alquiler = combineUnits(monthlyData, alquilerIds);
    return h1Labels.map((mesLabel, i) => ({
      mes: mesLabel,
      equiposVenta: equipos[i].facturado,
      alquilerVenta: alquiler[i].facturado,
      presupuestoTotal: equipos[i].presupuesto + alquiler[i].presupuesto,
    }));
  }, [monthlyData, unitIdsByLabel, h1Labels]);

  // Row 3 — receivables grouped by client + business unit.
  const receivablesRows: ReceivableRow[] = useMemo(() => {
    const map = new Map<string, ReceivableRow>();
    (cobranzasData ?? []).forEach((r) => {
      if (!r.unidad_negocio_id) return;
      const unidad = unidades?.find((u) => u.id === r.unidad_negocio_id);
      const unidadLabel = unidad ? unidadLabelInfo(unidad.nombre).label : "Sin unidad";
      const key = `${r.cliente}-${r.unidad_negocio_id}`;
      const entry = map.get(key) ?? {
        cliente: r.cliente,
        unidadId: r.unidad_negocio_id,
        unidadLabel,
        total: 0,
      };
      entry.total += Number(r.saldo ?? 0);
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [cobranzasData, unidades]);

  const receivablesUnitOptions = useMemo(
    () => (unidades ?? []).map((u) => ({ value: u.id, label: unidadLabelInfo(u.nombre).label })),
    [unidades],
  );

  const asesorComparativo = useMemo(() => {
    if (!asesorScoreData) return [];

    const aliases = new Map<string, string>();
    asesorScoreData.asesores.forEach((r) => {
      const normName = normalizarNombre(r.asesor ?? "");
      const code = String(r.codigo_asesor ?? "").trim();
      if (normName && code) aliases.set(normName, code);
    });

    const cotByAsesor = new Map<string, number>();
    asesorScoreData.cotizaciones.forEach((r) => {
      const resolved = resolverAsesor({ codigo: r.asesor_codigo }, aliases);
      const key = resolved.nombre;
      cotByAsesor.set(key, (cotByAsesor.get(key) ?? 0) + 1);
    });

    const facCountByAsesor = new Map<string, number>();
    const facMontoByAsesor = new Map<string, number>();
    asesorScoreData.facturas.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.asesor }, aliases);
      const key = resolved.nombre;
      facCountByAsesor.set(key, (facCountByAsesor.get(key) ?? 0) + 1);
      facMontoByAsesor.set(key, (facMontoByAsesor.get(key) ?? 0) + Number(r.monto ?? 0));
    });

    const minByAsesor = new Map<string, { total: number; cerradas: number }>();
    asesorScoreData.minutas.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.responsable }, aliases);
      const key = resolved.nombre;
      const current = minByAsesor.get(key) ?? { total: 0, cerradas: 0 };
      current.total += 1;
      if (r.estado === "cumplido") current.cerradas += 1;
      minByAsesor.set(key, current);
    });

    const base = new Map<string, { cumplimiento: number; participacion: number; venta: number }>();
    asesorScoreData.asesores.forEach((r) => {
      const resolved = resolverAsesor({ codigo: r.codigo_asesor, nombre: r.asesor }, aliases);
      const key = resolved.nombre;
      const curr = base.get(key) ?? { cumplimiento: 0, participacion: 0, venta: 0 };
      curr.cumplimiento = Math.max(curr.cumplimiento, Number(r.pct_cumplimiento ?? 0));
      curr.participacion = Math.max(curr.participacion, Number(r.pct_participacion ?? 0));
      curr.venta += Number(r.venta ?? 0);
      base.set(key, curr);
    });

    const rows = Array.from(base.entries())
      .filter(([asesor]) => asesor !== VENTAS_CASA.nombre)
      .map(([asesor, v]) => {
        const cot = cotByAsesor.get(asesor) ?? 0;
        const fac = facCountByAsesor.get(asesor) ?? 0;
        const conversion = cot > 0 ? (fac / cot) * 100 : 0;
        const ticket = fac > 0 ? (facMontoByAsesor.get(asesor) ?? 0) / fac : 0;
        const m = minByAsesor.get(asesor);
        const disciplina = m && m.total > 0 ? (m.cerradas / m.total) * 100 : 100;
        return {
          asesor,
          cumplimiento: Math.min(100, Math.max(0, v.cumplimiento)),
          participacion: Math.min(100, Math.max(0, v.participacion)),
          conversion: Math.min(100, Math.max(0, conversion)),
          ticket,
          disciplina: Math.min(100, Math.max(0, disciplina)),
          venta: v.venta,
        };
      });

    const maxTicket = rows.reduce((max, r) => Math.max(max, r.ticket), 0);
    return rows
      .map((r) => ({
        ...r,
        ticketNorm: maxTicket > 0 ? Math.min(100, (r.ticket / maxTicket) * 100) : 0,
      }))
      .sort((a, b) => b.venta - a.venta)
      .slice(0, 3);
  }, [asesorScoreData]);

  const radarByMetric = useMemo(() => {
    const metrics = ["Cumplimiento", "Conversión", "Ticket", "Disciplina", "Participación"];
    return metrics.map((m) => {
      const row: Record<string, string | number> = { metrica: m };
      asesorComparativo.forEach((a) => {
        row[a.asesor] =
          m === "Cumplimiento"
            ? a.cumplimiento
            : m === "Conversión"
              ? a.conversion
              : m === "Ticket"
                ? a.ticketNorm
                : m === "Disciplina"
                  ? a.disciplina
                  : a.participacion;
      });
      return row;
    });
  }, [asesorComparativo]);

  // Deferred values for graphics optimization (React.useDeferredValue)
  // This defers expensive Recharts renderings to prevent UI freezing during filter switching.
  const deferredCompanyTrend = useDeferredValue(companyTrend);
  const deferredCurrentPeriodByUnit = useDeferredValue(currentPeriodByUnit);
  const deferredGlobalTrend = useDeferredValue(globalTrend);
  const deferredRepuestosTrend = useDeferredValue(repuestosTrend);
  const deferredServiciosTrend = useDeferredValue(serviciosTrend);
  const deferredLubFiltrosTrend = useDeferredValue(lubFiltrosTrend);
  const deferredEquiposAlquilerTrend = useDeferredValue(equiposAlquilerTrend);
  const deferredRadarByMetric = useDeferredValue(radarByMetric);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Esta vista está disponible únicamente para el perfil Coordinador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <div>
        <h1 className="font-display text-3xl font-bold">Panel Financiero — Coordinador</h1>
        <p className="text-sm text-muted-foreground mt-1">Consolidado de toda tu sucursal</p>
      </div>

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unidades?.map((u) => ({
          value: u.id,
          label: unidadLabelInfo(u.nombre).label,
        }))}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      {/* Keyboard Shortcuts Info Bar */}
      <div
        role="region"
        aria-label="Atajos de teclado rápidos del panel"
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground/80 font-mono bg-card rounded-lg border border-border/40 select-none no-print"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="bg-foreground/5 text-foreground font-semibold px-1.5 py-0.5 rounded text-[10px] tracking-wider">
            SHORTCUTS
          </span>
          <span className="flex items-center gap-1.5" aria-keyshortcuts="ArrowLeft ArrowRight">
            Navegar Meses:{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              ←
            </kbd>{" "}
            /{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              →
            </kbd>
          </span>
        </div>
        <div className="hidden sm:inline-flex items-center gap-1.5" aria-keyshortcuts="Control+P">
          Imprimir / PDF:{" "}
          <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
            Ctrl + P
          </kbd>
        </div>
      </div>

      {/* Fila 1 — Cumplimiento general, ventas por compañía */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ComplianceGauge
          pct={currentPeriodTotals.cumplimiento}
          facturado={currentPeriodTotals.facturado}
          presupuesto={currentPeriodTotals.presupuesto}
        />
        <UnitDonut data={currentPeriodCompania} title="Ventas por Compañía" />
        <CompanyTrendChart data={deferredCompanyTrend} />
      </div>

      {/* Fila 2 — Ventas y presupuesto por unidad, a nivel global */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnitAmountBars data={deferredCurrentPeriodByUnit} />
        <GlobalMonthlyCombo data={deferredGlobalTrend} />
      </div>

      {/* Fila 3 — Repuestos y Servicios. content-visibility:auto difiere el
          layout/paint hasta que la fila entra al viewport (docs/MASTER_STRATEGY.md §1.3 M4). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [content-visibility:auto] [contain-intrinsic-size:auto_320px]">
        <RepuestosAreaChart data={deferredRepuestosTrend} />
        <ServiciosBarWithMarkers data={deferredServiciosTrend} />
      </div>

      {/* Fila 4 — Lubricantes/Filtros y Equipos/Alquiler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [content-visibility:auto] [contain-intrinsic-size:auto_320px]">
        <LubFiltrosComboLines data={deferredLubFiltrosTrend} />
        <EquiposAlquilerStacked data={deferredEquiposAlquilerTrend} />
      </div>

      {/* Fila 5 — Cuentas por cobrar */}
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_400px]">
        <ReceivablesTable rows={receivablesRows} unitOptions={receivablesUnitOptions} />
      </div>

      <div className="card-elevated p-5">
        <div className="mb-4">
          <h3 className="font-display font-semibold">Scorecard Comparativo de Asesores</h3>
          <p className="text-xs text-muted-foreground">
            Top asesores por venta con comparación de 5 ejes (escala normalizada 0-100)
          </p>
        </div>
        {asesorComparativo.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle className="text-sm font-normal text-muted-foreground">
                Sin datos suficientes para generar comparativo.
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="h-72 lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={deferredRadarByMetric}>
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis
                    dataKey="metrica"
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  {asesorComparativo.map((a, idx) => (
                    <Radar
                      key={a.asesor}
                      name={a.asesor}
                      dataKey={a.asesor}
                      stroke={
                        idx === 0
                          ? "var(--color-primary)"
                          : idx === 1
                            ? "var(--color-chart-calm-2)"
                            : "var(--color-chart-calm-4)"
                      }
                      fill={
                        idx === 0
                          ? "var(--color-primary)"
                          : idx === 1
                            ? "var(--color-chart-calm-2)"
                            : "var(--color-chart-calm-4)"
                      }
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-3">
              {asesorComparativo.map((a, idx) => (
                <div key={a.asesor} className="card-elevated p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          idx === 0
                            ? "bg-success/15 text-success"
                            : idx === 1
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/15 text-warning",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <p className="font-medium text-sm truncate">{a.asesor}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Venta</p>
                      <p className="font-semibold tabular-nums">
                        {a.venta.toLocaleString("es-VE")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conversión</p>
                      <p className="font-semibold tabular-nums">{a.conversion.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Cumplimiento</p>
                      <p className="font-semibold tabular-nums">{a.cumplimiento.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Disciplina</p>
                      <p className="font-semibold tabular-nums">{a.disciplina.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
