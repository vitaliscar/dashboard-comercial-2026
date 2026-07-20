import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, FileText, Receipt, Wallet } from "lucide-react";
import { CartesianGrid, XAxis, YAxis, ComposedChart, Line } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { money, pct, MESES } from "@/lib/format";
import { getAllMonthsCap, getAllowedMonths } from "@/lib/date-range";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { KpiCard } from "@/components/kpi-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export const Route = createFileRoute("/_app/embudo")({
  head: () => ({ meta: [{ title: "Embudo Comercial · CCV" }] }),
  component: EmbudoPage,
});

function EmbudoPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: unidades } = useUnidades();

  // Cotizado: cotizaciones.monto (neto Lub/Filtros ya restado en parser). Se trae el año
  // completo (no solo los meses filtrados) porque el gráfico de tendencia siempre muestra
  // los 12 meses, resaltando visualmente los seleccionados en vez de recortar la serie.
  const { data: cotizacionesAnio } = useQuery({
    queryKey: ["embudo-cotizaciones-anio", anio, selectedUnidades, profile?.id],
    queryFn: async () => {
      let q = scoped(
        supabase
          .from("cotizaciones")
          .select("id, unidad_negocio_id, monto, fecha")
          .gte("fecha", `${anio}-01-01`)
          .lt("fecha", `${anio + 1}-01-01`),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      if (selectedUnidades.length > 0) {
        q = q.in("unidad_negocio_id", selectedUnidades);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // Facturado: presupuestos (ventas_ccv + ventas_xibi + ventas_estrategicas), año completo.
  const { data: presupuestosAnio } = useQuery({
    queryKey: ["embudo-presupuestos-anio", anio, selectedUnidades, profile?.id],
    queryFn: async () => {
      let q = scoped(
        supabase
          .from("presupuestos")
          .select("id, mes, unidad_negocio_id, ventas_ccv, ventas_xibi, ventas_estrategicas")
          .eq("anio", anio),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
      );
      if (selectedUnidades.length > 0) {
        q = q.in("unidad_negocio_id", selectedUnidades);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // Totales del embudo (KPIs del hero) — un solo RPC ya scopeado server-side por
  // can_read_row, con el mismo criterio de "meses" (YTD/año completo) que el
  // resto de la app vía getAllowedMonths.
  const { data: funnelTotalsRaw } = useQuery({
    queryKey: ["embudo-totales", anio, JSON.stringify(meses), selectedUnidades],
    queryFn: async () => {
      const allowedMonths = getAllowedMonths(anio, meses);
      const { data, error } = await supabase.rpc("rpc_embudo_totales", {
        _anio: anio,
        _meses: allowedMonths,
        _unidades: selectedUnidades.length > 0 ? selectedUnidades : null,
      });
      if (error) throw error;
      return data?.[0] ?? { cotizado: 0, facturado: 0, cobrado: 0 };
    },
  });

  const funnelTotals = useMemo(() => {
    const cotizado = funnelTotalsRaw?.cotizado ?? 0;
    const facturado = funnelTotalsRaw?.facturado ?? 0;
    const cobrado = funnelTotalsRaw?.cobrado ?? 0;
    const tasaConversion = cotizado > 0 ? (facturado / cotizado) * 100 : 0;
    const tasaCobro = facturado > 0 ? (cobrado / facturado) * 100 : 100;
    return {
      cotizado: Math.round(cotizado * 100) / 100,
      facturado: Math.round(facturado * 100) / 100,
      cobrado: Math.round(cobrado * 100) / 100,
      tasaConversion: Math.round(tasaConversion * 100) / 100,
      tasaCobro: Math.round(tasaCobro * 100) / 100,
    };
  }, [funnelTotalsRaw]);

  // Qué meses están "seleccionados" para resaltar en el gráfico — mismo criterio de
  // "Todos" que el resto de la app: YTD en el año actual, año completo en años pasados.
  const highlightedMonths = useMemo(() => {
    if (meses !== "all") return new Set(meses);
    const cap = getAllMonthsCap(anio);
    return new Set(Array.from({ length: cap }, (_, i) => i + 1));
  }, [meses, anio]);

  // Tendencia mensual (todo el año, sin importar el filtro de mes): cada punto trae su
  // propio valor "resaltado" (solo si el mes está en el filtro actual) para que el gráfico
  // de línea pueda dibujar la serie completa atenuada y superponer los meses seleccionados
  // en color pleno, sin recortar la tendencia.
  const funnelByMonth = useMemo(() => {
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      mesNum: i + 1,
      mes: MESES[i].slice(0, 3),
      cotizado: 0,
      facturado: 0,
    }));

    (cotizacionesAnio ?? []).forEach((c) => {
      const m = new Date(c.fecha).getMonth();
      if (m >= 0 && m < 12) monthly[m].cotizado += Number(c.monto ?? 0);
    });

    (presupuestosAnio ?? []).forEach((p) => {
      if (p.mes >= 1 && p.mes <= 12) {
        monthly[p.mes - 1].facturado +=
          Number(p.ventas_ccv ?? 0) +
          Number(p.ventas_xibi ?? 0) +
          Number(p.ventas_estrategicas ?? 0);
      }
    });

    return monthly.map((row) => {
      // Umbral mínimo para evitar que un cotizado residual (centavos) frente a un
      // facturado real dispare un % de conversión absurdo (p. ej. millones de %).
      const tasaConversion =
        row.cotizado >= 100 ? Math.min(999, (row.facturado / row.cotizado) * 100) : 0;
      const isHighlighted = highlightedMonths.has(row.mesNum);
      return {
        ...row,
        tasaConversion,
        cotizadoResaltado: isHighlighted ? row.cotizado : null,
        facturadoResaltado: isHighlighted ? row.facturado : null,
        tasaConversionResaltada: isHighlighted ? tasaConversion : null,
        isHighlighted,
      };
    });
  }, [cotizacionesAnio, presupuestosAnio, highlightedMonths]);

  const chartData = funnelByMonth;

  const funnelChartConfig: ChartConfig = {
    cotizado: { label: "Cotizado (año)", color: "var(--color-primary)" },
    facturado: { label: "Facturado (año)", color: "var(--color-success)" },
    cotizadoResaltado: { label: "Cotizado", color: "var(--color-primary)" },
    facturadoResaltado: { label: "Facturado", color: "var(--color-success)" },
  };

  const conversionChartConfig: ChartConfig = {
    tasaConversion: { label: "% Conversión (año)", color: "var(--color-destructive)" },
    tasaConversionResaltada: { label: "% Conversión", color: "var(--color-destructive)" },
  };

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <TrendingUp className="h-7 w-7" /> Embudo Comercial
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cotizado → Facturado → Cobrado — eficiencia comercial
        </p>
      </div>

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unidades?.map((u) => ({ value: u.id, label: u.nombre }))}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Cotizado"
          value={money(funnelTotals.cotizado)}
          hint="cotizaciones del período"
          accent="primary"
          icon={FileText}
        />
        <KpiCard
          label="Facturado"
          value={money(funnelTotals.facturado)}
          hint="presupuestos (CCV+Xibi+Estratégicas)"
          accent="success"
          icon={Receipt}
        />
        <KpiCard
          label="Cobrado"
          value={money(funnelTotals.cobrado)}
          hint="facturado − saldo cobranzas"
          accent="ochre"
          icon={Wallet}
        />
        <KpiCard
          label="% Conversión"
          value={pct(funnelTotals.tasaConversion, 1)}
          hint="facturado / cotizado"
          accent={funnelTotals.tasaConversion >= 70 ? "success" : "warning"}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold mb-1">Embudo por Unidad de Negocio</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Tendencia mensual — meses seleccionados resaltados, el resto atenuado
          </p>
          <ChartContainer config={funnelChartConfig} className="h-72 w-full">
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              {/* Serie completa atenuada de fondo (los 12 meses, sin puntos) */}
              <Line
                type="monotone"
                dataKey="cotizado"
                stroke="var(--color-cotizado)"
                strokeWidth={2}
                strokeOpacity={0.25}
                dot={false}
                legendType="none"
                name="Cotizado (año)"
              />
              <Line
                type="monotone"
                dataKey="facturado"
                stroke="var(--color-facturado)"
                strokeWidth={2}
                strokeOpacity={0.25}
                dot={false}
                legendType="none"
                name="Facturado (año)"
              />
              {/* Meses seleccionados, resaltados en color pleno */}
              <Line
                type="monotone"
                dataKey="cotizadoResaltado"
                stroke="var(--color-cotizado)"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
                name="Cotizado"
              />
              <Line
                type="monotone"
                dataKey="facturadoResaltado"
                stroke="var(--color-facturado)"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
                name="Facturado"
              />
            </ComposedChart>
          </ChartContainer>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold mb-1">Tasa de Conversión por Unidad</h3>
          <p className="text-xs text-muted-foreground mb-4">
            % Facturado / Cotizado por mes — meses seleccionados resaltados
          </p>
          <ChartContainer config={conversionChartConfig} className="h-72 w-full">
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                allowDataOverflow
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {`${Number(value).toFixed(1)}%`}
                      </span>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="tasaConversion"
                stroke="var(--color-tasaConversion)"
                strokeWidth={2}
                strokeOpacity={0.25}
                dot={false}
                legendType="none"
                name="% Conversión (año)"
              />
              <Line
                type="monotone"
                dataKey="tasaConversionResaltada"
                stroke="var(--color-tasaConversion)"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
                name="% Conversión"
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-semibold">Detalle por Unidad de Negocio</h3>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary sticky top-0 [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Mes
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  Cotizado
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  Facturado
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  % Conversión
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funnelByMonth.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin datos para el período seleccionado
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                funnelByMonth.map((row) => (
                  <TableRow
                    key={row.mesNum}
                    className={`border-b border-border/50 last:border-0 hover:bg-muted/40 ${
                      row.isHighlighted ? "bg-primary/5" : ""
                    }`}
                  >
                    <TableCell className="px-4 py-3 font-medium">{MESES[row.mesNum - 1]}</TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums font-medium">
                      {money(row.cotizado)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">
                      {money(row.facturado)}
                    </TableCell>
                    <TableCell
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        row.tasaConversion >= 70
                          ? "text-success"
                          : row.tasaConversion >= 50
                            ? "text-warning"
                            : "text-destructive"
                      }`}
                    >
                      {pct(row.tasaConversion, 1)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
