import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { money, pct, statusFromPct } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState, useMemo, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Shield,
  TrendingUp,
  Users,
  Calendar,
  Trophy,
  Award,
  TrendingDown,
  Percent,
  CheckCircle2,
  Eye,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { resolverAsesor, VENTAS_CASA, normalizarNombre } from "@/lib/asesores-catalogo";
import {
  consolidarAsesores,
  calcularKPIs,
  prepararDatosPareto,
  type AgrupacionAsesor,
} from "@/lib/analytics/asesores";
import {
  getDateRangesForMonths,
  applyDateRangesToQuery,
  applyMonthFilterToQuery,
} from "@/lib/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export const Route = createFileRoute("/_app/asesores")({
  head: () => ({ meta: [{ title: "Análisis de Asesores · CCV" }] }),
  component: AsesoresPage,
});

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const TEXT_ACCENT_CLASS: Record<"success" | "warning" | "danger", string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function AsesoresPage() {
  const { role, profile, user } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, sucursales: selectedSucursales, unidades: selectedUnidades } = filters;

  const [activeTab, setActiveTab] = useState<"ranking" | "pareto">("ranking");
  const [paretoTipo, setParetoTipo] = useState<"venta" | "cotizado">("venta");
  const [selectedAdvisor, setSelectedAdvisor] = useState<AgrupacionAsesor | null>(null);

  const canView = role === "gerencia" || role === "gerente_comercial" || role === "coordinador";

  // Fetch reference metadata
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const sucursalOptions = useMemo(() => {
    if (!sucursales) return [];
    return sucursales.map((s) => ({ value: s.id, label: s.nombre }));
  }, [sucursales]);

  const unitOptions = useMemo(() => {
    if (!unidades) return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades]);

  // Compute selected filter scope values
  const selectedSucursalId = selectedSucursales.length > 0 ? selectedSucursales[0] : null;

  const dateRanges = useMemo(() => {
    return getDateRangesForMonths(anio, meses);
  }, [anio, meses]);

  const filterKey = JSON.stringify({ anio, meses, selectedSucursales, selectedUnidades });

  // 1. Fetch main commercial tables
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["asesores-raw-data", filterKey],
    enabled: canView && !!sucursales && !!unidades,
    queryFn: async () => {
      const buildCotQuery = () => {
        let q = scoped(
          supabase
            .from("cotizaciones")
            .select("asesor_codigo, monto, sucursal_id, unidad_negocio_id"),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        if (selectedUnidades.length > 0) q = q.in("unidad_negocio_id", selectedUnidades);
        return q;
      };

      const buildFacQuery = () => {
        let q = scoped(
          supabase.from("facturas").select("asesor, monto, sucursal_id, unidad_negocio_id"),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        if (selectedUnidades.length > 0) q = q.in("unidad_negocio_id", selectedUnidades);
        return q;
      };

      const buildVpQuery = () => {
        let q = scoped(
          supabase.from("ventas_perdidas").select("asesor, monto, sucursal_id, unidad_negocio_id"),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        if (selectedUnidades.length > 0) q = q.in("unidad_negocio_id", selectedUnidades);
        return q;
      };

      const buildMetasQuery = () => {
        let q = scoped(
          supabase
            .from("cumplimiento_asesores")
            .select("codigo_asesor, asesor, presupuesto, sucursal_id, unidad_negocio_id"),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
        q = applyMonthFilterToQuery(q, meses, anio);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        if (selectedUnidades.length > 0) q = q.in("unidad_negocio_id", selectedUnidades);
        return q;
      };

      const [cotizaciones, facturas, perdidas, metas] = await Promise.all([
        fetchAllRows(buildCotQuery),
        fetchAllRows(buildFacQuery),
        fetchAllRows(buildVpQuery),
        buildMetasQuery(),
      ]);

      if (metas.error) throw metas.error;

      return {
        cotizaciones,
        facturas,
        perdidas,
        metas: metas.data || [],
      };
    },
  });

  // 2. Fetch specific advisor detail/drill-down historical trend
  const { data: drilldownData, isLoading: isLoadingDrilldown } = useQuery({
    queryKey: ["asesores-drilldown", selectedAdvisor?.codigo, selectedAdvisor?.nombre, anio],
    enabled: !!selectedAdvisor && canView,
    queryFn: async () => {
      if (!selectedAdvisor) return null;

      // Dynamic name-to-code resolver alias map
      const { data: caData } = await supabase
        .from("cumplimiento_asesores")
        .select("codigo_asesor, asesor")
        .not("codigo_asesor", "is", null)
        .not("asesor", "is", null);

      const aliases = new Map<string, string>();
      (caData || []).forEach((row) => {
        const normName = normalizarNombre(row.asesor);
        const code = String(row.codigo_asesor).trim();
        if (normName && code) aliases.set(normName, code);
      });

      // A. Fetch historical metas/budgets for the chosen year
      const buildMetasQ = () => {
        return scoped(
          supabase
            .from("cumplimiento_asesores")
            .select("mes, presupuesto, codigo_asesor, asesor, sucursal_id, unidad_negocio_id")
            .eq("anio", anio),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      };

      // B. Fetch historical sales for the chosen year
      const buildFacQ = () => {
        return scoped(
          supabase
            .from("facturas")
            .select("monto, fecha, asesor, sucursal_id, unidad_negocio_id")
            .gte("fecha", `${anio}-01-01`)
            .lt("fecha", `${anio + 1}-01-01`),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      };

      // C. Fetch historical cotizaciones
      const buildCotQ = () => {
        return scoped(
          supabase
            .from("cotizaciones")
            .select(
              "monto, fecha, cliente, descripcion, nro_cotizacion, etapa, asesor_codigo, sucursal_id, unidad_negocio_id",
            )
            .gte("fecha", `${anio}-01-01`)
            .lt("fecha", `${anio + 1}-01-01`),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      };

      // D. Fetch historical perdidas
      const buildVpQ = () => {
        return scoped(
          supabase
            .from("ventas_perdidas")
            .select("monto, fecha, cliente, razon, asesor, sucursal_id, unidad_negocio_id")
            .gte("fecha", `${anio}-01-01`)
            .lt("fecha", `${anio + 1}-01-01`),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      };

      const [metasRes, facturasRes, cotizacionesRes, perdidasRes] = await Promise.all([
        fetchAllRows(buildMetasQ),
        fetchAllRows(buildFacQ),
        fetchAllRows(buildCotQ),
        fetchAllRows(buildVpQ),
      ]);

      // Filter in memory for the selected advisor or Ventas Casa
      const filterByAdvisor = (row: Record<string, unknown>, key: "codigo" | "nombre") => {
        const codeVal = (row.asesor_codigo || row.codigo_asesor) as string | number | undefined;
        const nameVal = row.asesor as string | undefined;
        const resolved = resolverAsesor(
          key === "codigo" ? { codigo: codeVal } : { nombre: nameVal },
          aliases,
        );
        return resolved.codigo === selectedAdvisor.codigo;
      };

      const filteredMetas = metasRes.filter((r) => filterByAdvisor(r, "codigo"));
      const filteredFacturas = facturasRes.filter((r) => filterByAdvisor(r, "nombre"));
      const filteredCotizaciones = cotizacionesRes.filter((r) => filterByAdvisor(r, "codigo"));
      const filteredPerdidas = perdidasRes.filter((r) => filterByAdvisor(r, "nombre"));

      // Compute monthly trend arrays
      const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        mesNum: i + 1,
        mes: MESES[i],
        venta: 0,
        meta: 0,
      }));

      filteredMetas.forEach((m) => {
        if (m.mes >= 1 && m.mes <= 12) {
          monthlyData[m.mes - 1].meta += Number(m.presupuesto || 0);
        }
      });

      filteredFacturas.forEach((f) => {
        const fMonth = new Date(f.fecha).getMonth();
        if (fMonth >= 0 && fMonth < 12) {
          monthlyData[fMonth].venta += Number(f.monto || 0);
        }
      });

      return {
        monthlyData,
        recentCotizaciones: filteredCotizaciones.slice(0, 10),
        recentPerdidas: filteredPerdidas.slice(0, 10),
      };
    },
  });

  // 3. Process aggregation
  const { list, kpis, paretoData, unitMap } = useMemo(() => {
    if (!rawData || !unidades) {
      return { list: [], kpis: null, paretoData: [], unitMap: new Map() };
    }

    const uMap = new Map<string, string>();
    unidades.forEach((u) => uMap.set(u.id, u.nombre));

    // Construct alias map dynamically
    const aliases = new Map<string, string>();
    rawData.metas.forEach((row: Record<string, unknown>) => {
      const normName = normalizarNombre(row.asesor as string);
      const code = String(row.codigo_asesor ?? "").trim();
      if (normName && code) aliases.set(normName, code);
    });

    const consolidated = consolidarAsesores(
      rawData.facturas,
      rawData.cotizaciones,
      rawData.perdidas,
      rawData.metas,
      aliases,
    );

    const calculatedKpis = calcularKPIs(consolidated);
    const pareto = prepararDatosPareto(consolidated, paretoTipo);

    // Sort list: Casa always on top/distinct, then advisors by sales descending
    const advisors = consolidated
      .filter((a) => a.codigo !== VENTAS_CASA.codigo)
      .sort((a, b) => b.venta - a.venta);
    const casa = consolidated.find((a) => a.codigo === VENTAS_CASA.codigo);

    const finalList = casa ? [casa, ...advisors] : advisors;

    return {
      list: finalList,
      kpis: calculatedKpis,
      paretoData: pareto,
      unitMap: uMap,
    };
  }, [rawData, unidades, paretoTipo]);

  // Compute Pareto chart metrics
  const paretoChartData = useMemo(() => {
    let acc = 0;
    const total = paretoData.reduce((sum, item) => sum + item.value, 0);

    return paretoData.map((item) => {
      acc += item.value;
      const pctAcumulado = total > 0 ? (acc / total) * 100 : 0;
      return {
        ...item,
        acumulado: Number(pctAcumulado.toFixed(1)),
      };
    });
  }, [paretoData]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-card border border-border rounded-lg p-8 text-center shadow-sm">
        <Shield className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-bold text-foreground">Acceso Restringido</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-[280px]">
          No tienes permisos suficientes para visualizar el análisis gerencial de asesores.
        </p>
      </div>
    );
  }

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursales ?? (f.sucursal ? [f.sucursal] : []),
      unidades: f.unidades ?? [],
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Vista Gerencial"
        title="Análisis de Asesores"
        description="Rendimiento consolidado, metas asignadas, conversión y ranking comercial por asesor de ventas."
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        defaultAnio={anio}
        defaultMes={meses}
        defaultUnits={selectedUnidades}
        sucursalOptions={sucursalOptions}
        sucursalMulti={role === "gerencia"}
        unitOptions={unitOptions}
        showAllMonths={true}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-card border border-border animate-pulse rounded-md" />
          ))}
        </div>
      ) : kpis ? (
        <>
          {/* INDICADORES CLAVE */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Facturado Asesores"
              value={money(kpis.totalFacturadoAsesores)}
              hint="Suma total de facturas de asesores canónicos"
              icon={Award}
            />
            <KpiCard
              label="Ventas Casa"
              value={money(kpis.totalFacturadoVentasCasa)}
              hint="Ventas no asignadas a asesores del catálogo"
              icon={Users}
            />
            <KpiCard
              label="Cumplimiento Promedio"
              value={pct(kpis.cumplimientoPromedio)}
              hint="Cumplimiento global sobre presupuesto asignado"
              icon={TrendingUp}
              trend={{
                value: kpis.cumplimientoPromedio,
                positive: kpis.cumplimientoPromedio >= 100,
              }}
              trendTone={kpis.cumplimientoPromedio >= 100 ? "success" : "danger"}
            />
            <KpiCard
              label="Asesores sobre Meta"
              value={`${kpis.asesoresSobreMeta} / ${kpis.totalAsesoresConMeta}`}
              hint="Asesores que superaron el 100% de su cuota"
              icon={CheckCircle2}
            />
          </div>

          {/* VISTAS DETALLADAS */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "ranking" | "pareto")}
            className="w-full mt-2"
          >
            <div className="flex items-center justify-between border-b border-border pb-1 flex-wrap gap-2">
              <TabsList className="bg-transparent p-0 gap-2 h-auto">
                <TabsTrigger
                  value="ranking"
                  className="px-4 py-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-auto font-semibold text-sm transition-all"
                >
                  Ranking Comercial
                </TabsTrigger>
                <TabsTrigger
                  value="pareto"
                  className="px-4 py-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-auto font-semibold text-sm transition-all"
                >
                  Distribución Pareto
                </TabsTrigger>
              </TabsList>

              {activeTab === "pareto" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Métrica:</span>
                  <Tabs
                    value={paretoTipo}
                    onValueChange={(val) => setParetoTipo(val as "venta" | "cotizado")}
                    className="h-8"
                  >
                    <TabsList className="h-8 p-0.5 bg-muted">
                      <TabsTrigger value="venta" className="h-7 px-3 text-xs font-bold">
                        Facturado
                      </TabsTrigger>
                      <TabsTrigger value="cotizado" className="h-7 px-3 text-xs font-bold">
                        Cotizado
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </div>

            {/* CONTENIDO PESTAÑA: RANKING */}
            <TabsContent value="ranking" className="mt-4">
              <div className="bg-card border border-border shadow-sm rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="font-bold">Asesor</TableHead>
                      <TableHead className="font-bold text-center w-24">Código</TableHead>
                      <TableHead className="font-bold text-right">Facturado</TableHead>
                      <TableHead className="font-bold text-right">Presupuesto</TableHead>
                      <TableHead className="font-bold text-center w-36">Cumplimiento</TableHead>
                      <TableHead className="font-bold text-right">Cotizado</TableHead>
                      <TableHead className="font-bold text-right">Perdido</TableHead>
                      <TableHead className="font-bold text-center w-20">Conversión</TableHead>
                      <TableHead className="font-bold text-center w-20">Part.</TableHead>
                      <TableHead className="font-bold text-center w-16">Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                          No se encontraron registros comercial en este período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      list.map((item) => {
                        const isCasa = item.codigo === VENTAS_CASA.codigo;
                        const status = statusFromPct(item.cumplimiento);
                        const statusClass = TEXT_ACCENT_CLASS[status];

                        return (
                          <TableRow
                            key={item.codigo}
                            className={cn(
                              "hover:bg-muted/20 transition-colors",
                              isCasa && "bg-secondary/40 font-semibold hover:bg-secondary/60",
                            )}
                          >
                            <TableCell className="py-3">
                              <div>
                                <p className="font-semibold text-sm">{item.nombre}</p>
                                <p className="text-xs text-muted-foreground">{item.sucursal}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {item.codigo}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {money(item.venta)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {isCasa ? "—" : money(item.meta)}
                            </TableCell>
                            <TableCell className="py-2.5">
                              {isCasa ? (
                                <div className="text-center text-xs text-muted-foreground">—</div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className={cn("font-bold", statusClass)}>
                                      {pct(item.cumplimiento)}
                                    </span>
                                  </div>
                                  <Progress
                                    value={Math.min(item.cumplimiento, 100)}
                                    className="h-1.5"
                                  />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {money(item.cotizado)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {money(item.perdido)}
                            </TableCell>
                            <TableCell className="text-center font-semibold text-xs">
                              {pct(item.conversion)}
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {pct(item.participacion)}
                            </TableCell>
                            <TableCell className="text-center py-2">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => setSelectedAdvisor(item)}
                                className="h-7 w-7"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* CONTENIDO PESTAÑA: PARETO */}
            <TabsContent value="pareto" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pareto Chart */}
                <div className="lg:col-span-2 bg-card border border-border p-4 rounded-lg shadow-sm">
                  <h4 className="text-sm font-bold text-foreground mb-4">
                    Gráfico Acumulado 80/20 por Asesor (
                    {paretoTipo === "venta" ? "Facturado" : "Cotizado"})
                  </h4>
                  {paretoChartData.length === 0 ? (
                    <div className="h-80 flex flex-col justify-center items-center text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mb-2" />
                      <p className="text-xs">
                        No hay datos suficientes para graficar la distribución.
                      </p>
                    </div>
                  ) : (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={paretoChartData}
                          margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                            height={50}
                          />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                labelKey="name"
                                indicator="line"
                                className="w-56"
                              />
                            }
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="value"
                            name="Monto"
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="acumulado"
                            name="% Acumulado"
                            stroke="hsl(var(--destructive))"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <ReferenceLine
                            yAxisId="right"
                            y={80}
                            stroke="hsl(var(--destructive))"
                            strokeDasharray="4 4"
                            label={{
                              value: "Límite 80%",
                              position: "insideTopLeft",
                              fontSize: 10,
                              fill: "hsl(var(--destructive))",
                            }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Pareto Statistics */}
                <div className="bg-card border border-border p-4 rounded-lg flex flex-col gap-4 shadow-sm justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-3">
                      Estadísticas de Distribución
                    </h4>
                    <p className="text-xs text-muted-foreground mb-4">
                      El análisis Pareto identifica a los asesores clave que generan el 80% de la
                      facturación o cotización.
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Total general
                        </span>
                        <span className="text-sm font-bold">
                          {money(paretoChartData.reduce((sum, item) => sum + item.value, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Asesores vitales (80%)
                        </span>
                        <span className="text-sm font-bold">
                          {paretoChartData.filter((r) => r.acumulado <= 80).length} de{" "}
                          {paretoChartData.length}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Concentración
                        </span>
                        <span className="text-sm font-bold">
                          {paretoChartData.length > 0
                            ? `${((paretoChartData.filter((r) => r.acumulado <= 80).length / paretoChartData.length) * 100).toFixed(1)}%`
                            : "0%"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/40 border border-dashed rounded p-3 text-xs text-muted-foreground flex gap-2">
                    <Percent className="h-5 w-5 shrink-0 text-primary" />
                    <span>
                      Enfoque la atención gerencial en optimizar los procesos de cotización y cierre
                      del grupo de asesores vitales.
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="h-64 flex justify-center items-center text-muted-foreground">
          Cargando datos comercial...
        </div>
      )}

      {/* DRILL-DOWN MODAL DIALOG */}
      <Dialog open={!!selectedAdvisor} onOpenChange={(open) => !open && setSelectedAdvisor(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedAdvisor && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Detalle: {selectedAdvisor.nombre}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Desglose mensual de cumplimiento, cotizaciones y razones de pérdida para la
                  sucursal de {selectedAdvisor.sucursal} ({anio}).
                </DialogDescription>
              </DialogHeader>

              {isLoadingDrilldown ? (
                <div className="h-64 flex justify-center items-center text-muted-foreground text-xs">
                  Cargando tendencia y registros del asesor...
                </div>
              ) : drilldownData ? (
                <div className="flex flex-col gap-6 mt-4">
                  {/* Composed Chart: Meta vs Venta */}
                  <div className="bg-muted/20 border border-border p-4 rounded-lg">
                    <h4 className="text-xs font-bold mb-3 text-foreground uppercase tracking-wider">
                      Tendencia Mensual ({anio}) — Venta vs Meta
                    </h4>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={drilldownData.monthlyData}
                          margin={{ top: 10, right: 10, bottom: 0, left: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <ChartTooltip
                            content={<ChartTooltipContent labelKey="mes" indicator="dot" />}
                          />
                          <Bar
                            dataKey="venta"
                            name="Facturado"
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={30}
                          />
                          <Line
                            type="monotone"
                            dataKey="meta"
                            name="Presupuesto"
                            stroke="hsl(var(--destructive))"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cotizaciones Recientes */}
                    <div className="bg-card border border-border p-3 rounded-lg flex flex-col gap-3">
                      <h4 className="text-xs font-bold text-foreground border-b pb-1.5 flex items-center gap-1.5">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        COTIZACIONES RECIENTES
                      </h4>
                      {drilldownData.recentCotizaciones.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No hay cotizaciones registradas para este asesor en el año.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                          {drilldownData.recentCotizaciones.map((c, i) => (
                            <div
                              key={i}
                              className="text-xs border-b pb-1.5 last:border-0 flex justify-between gap-4"
                            >
                              <div className="truncate">
                                <p className="font-semibold truncate">
                                  {c.descripcion ||
                                    c.nro_cotizacion ||
                                    "Cotización sin descripción"}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {c.cliente}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold">{money(c.monto)}</p>
                                <p className="text-[10px] text-primary">{c.etapa}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Ventas Perdidas Recientes */}
                    <div className="bg-card border border-border p-3 rounded-lg flex flex-col gap-3">
                      <h4 className="text-xs font-bold text-foreground border-b pb-1.5 flex items-center gap-1.5">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        RAZONES DE PÉRDIDA
                      </h4>
                      {drilldownData.recentPerdidas.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No hay ventas perdidas registradas para este asesor en el año.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                          {drilldownData.recentPerdidas.map((p, i) => (
                            <div
                              key={i}
                              className="text-xs border-b pb-1.5 last:border-0 flex justify-between gap-4"
                            >
                              <div className="truncate">
                                <p className="font-semibold truncate">{p.cliente}</p>
                                <p className="text-[10px] text-destructive truncate">
                                  {p.razon || "Razón no especificada"}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold">{money(p.monto)}</p>
                                <p className="text-[10px] text-muted-foreground">{p.fecha}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-32 flex justify-center items-center text-muted-foreground text-xs">
                  No hay datos histórico para este asesor.
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
