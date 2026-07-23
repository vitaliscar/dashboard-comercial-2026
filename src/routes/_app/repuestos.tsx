import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getRepuestosMetricsFn, getRepuestosTrendFn } from "@/lib/server/repuestos";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { KpiCard } from "@/components/kpi-card";
import { money, pct, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getDateRangesForMonths, getAllMonthsCap } from "@/lib/date-range";
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  LineChart,
} from "recharts";
import { Package, DollarSign, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/repuestos")({
  head: () => ({ meta: [{ title: "Dashboard Repuestos · CCV" }] }),
  component: Repuestos,
});

function Repuestos() {
  const { role } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;

  const { data: sucursales } = useSucursales();

  const dateRanges = useMemo(() => {
    return getDateRangesForMonths(anio, meses);
  }, [anio, meses]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({ anio: f.anio, meses: f.meses });
  };

  // Fetch facturación data for Repuestos
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["repuestos-metrics", JSON.stringify(dateRanges)],
    queryFn: async () => {
      const data = await getRepuestosMetricsFn({ data: { ranges: dateRanges } });
      return { facturas: data };
    },
  });

  // Fetch monthly trends (full year)
  const { data: trendData } = useQuery({
    queryKey: ["repuestos-trend", anio],
    queryFn: async () => {
      const data = await getRepuestosTrendFn({ data: { anio } });
      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i].slice(0, 3),
        ventas: 0,
      }));
      (data ?? []).forEach((r) => {
        const m = new Date(r.fecha).getMonth();
        byMonth[m].ventas += Number(r.monto);
      });

      if (meses !== "all") {
        const allowedShortNames = meses.map((m) => MESES[m - 1].slice(0, 3));
        return byMonth.filter((item) => allowedShortNames.includes(item.mes));
      } else {
        const cap = getAllMonthsCap(anio);
        return byMonth.slice(0, cap);
      }
    },
  });

  // Aggregate data
  const totales = useMemo(() => {
    const facturado = metricsData?.facturas.reduce((a, r) => a + Number(r.monto), 0) ?? 0;
    return { facturado, count: metricsData?.facturas.length ?? 0 };
  }, [metricsData]);

  const porSucursal = useMemo(() => {
    if (!metricsData || !sucursales) return [];
    const map = new Map<string, { nombre: string; monto: number }>();
    sucursales.forEach((s) => map.set(s.id, { nombre: s.nombre, monto: 0 }));
    metricsData.facturas.forEach((r) => {
      if (r.sucursalId && map.has(r.sucursalId)) {
        map.get(r.sucursalId)!.monto += Number(r.monto);
      }
    });
    return Array.from(map.values())
      .filter((r) => r.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [metricsData, sucursales]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { cliente: string; monto: number }>();
    metricsData?.facturas.forEach((r) => {
      const k = r.cliente || "Sin cliente";
      if (!map.has(k)) map.set(k, { cliente: k, monto: 0 });
      map.get(k)!.monto += Number(r.monto);
    });
    return Array.from(map.values())
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);
  }, [metricsData]);

  const PIE_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-calm-2)",
  ];

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Unidad de Negocio"
        title="Repuestos"
        description="Dashboard de facturación de la unidad de Repuestos"
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Facturación Repuestos"
          value={money(totales.facturado)}
          hint={`${totales.count} transacciones`}
          accent="success"
          icon={DollarSign}
        />
        <KpiCard
          label="Top Sucursal"
          value={porSucursal[0]?.nombre ?? "—"}
          hint={porSucursal[0] ? money(porSucursal[0].monto) : "Sin datos"}
          accent="primary"
          icon={TrendingUp}
        />
        <KpiCard
          label="Período"
          value={meses === "all" ? `${anio}` : `${meses.join(", ")}/${anio}`}
          hint="mes/año seleccionado"
          accent="primary"
          icon={Package}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Ventas Mensuales Repuestos</h3>
            <p className="text-xs text-muted-foreground">Tendencia anual {anio}</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData ?? []}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
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
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Bar
                  dataKey="ventas"
                  fill="var(--color-primary)"
                  opacity={0.2}
                  radius={[4, 4, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Participación por Sucursal</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribución de ingresos</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porSucursal}
                  dataKey="monto"
                  nameKey="nombre"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {porSucursal.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Ventas por Sucursales</h3>
          <p className="text-xs text-muted-foreground mb-4">Ranking de desempeño</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porSucursal} layout="vertical">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
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
                  fontSize={10}
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

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Tendencia mensual</h3>
          <p className="text-xs text-muted-foreground mb-4">{anio} - Evolución de ventas</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData ?? []}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
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
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-display font-semibold">Ventas por Sucursal</h3>
            <p className="text-xs text-muted-foreground">Desempeño por oficina</p>
          </div>
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Sucursal
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Monto
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  % Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porSucursal.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin datos para el período
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                porSucursal.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 py-2.5 font-medium">{s.nombre}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {money(s.monto)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {pct((s.monto / (totales.facturado || 1)) * 100)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="card-elevated overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-display font-semibold">Clientes - Cuentas x Cobrar</h3>
            <p className="text-xs text-muted-foreground">Top 10 por monto facturado</p>
          </div>
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Cliente
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  Monto
                </TableHead>
                <TableHead className="text-right px-4 py-2 font-medium text-xs tracking-wider text-primary-foreground">
                  % Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topClientes.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin datos
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                topClientes.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 py-2.5 font-medium">{c.cliente}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {money(c.monto)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {pct((c.monto / (totales.facturado || 1)) * 100)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
