"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, FileText, Receipt, Wallet } from "lucide-react";
import { CartesianGrid, XAxis, YAxis, ComposedChart, Line } from "recharts";
import {
  getEmbudoCotizacionesAnioAction,
  getEmbudoPresupuestosAnioAction,
  getEmbudoTotalesAction,
} from "@/lib/actions/embudo";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
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

export default function EmbudoPage() {
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

  const { data: cotizacionesAnio } = useQuery({
    queryKey: ["embudo-cotizaciones-anio", anio, selectedUnidades],
    queryFn: () => getEmbudoCotizacionesAnioAction({ anio, unidades: selectedUnidades }),
  });

  const { data: presupuestosAnio } = useQuery({
    queryKey: ["embudo-presupuestos-anio", anio, selectedUnidades],
    queryFn: () => getEmbudoPresupuestosAnioAction({ anio, unidades: selectedUnidades }),
  });

  const { data: funnelTotalsRaw, isLoading } = useQuery({
    queryKey: ["embudo-totales", anio, JSON.stringify(meses), selectedUnidades],
    queryFn: () => {
      const allowedMonths = getAllowedMonths(anio, meses);
      return getEmbudoTotalesAction({
        anio,
        meses: allowedMonths,
        unidades: selectedUnidades,
      });
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

  const highlightedMonths = useMemo(() => {
    if (meses !== "all") return new Set(meses);
    const cap = getAllMonthsCap(anio);
    return new Set(Array.from({ length: cap }, (_, i) => i + 1));
  }, [meses, anio]);

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
          Number(p.ventasCcv ?? 0) + Number(p.ventasXibi ?? 0) + Number(p.ventasEstrategicas ?? 0);
      }
    });

    return monthly.map((row) => {
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

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
