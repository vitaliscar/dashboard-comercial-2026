import { isFullAccessRole } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { Search } from "@/components/icons";
import { Fragment, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { money, moneyShort } from "@/lib/format";
import { diasVencidosDesde, getAllMonthsCap, getHighlightMonthLabels } from "@/lib/date-range";
import { MESES } from "@/lib/format";
import { getMonthlySalesProjection } from "@/lib/business-days";
import { getUnidadData, type UnidadData, type UnidadKey } from "@/lib/unidad-http";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { MarcasMonthlyChart, type MonthlyMarcaRow } from "@/components/lubfiltros/MarcasMonthlyChart";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PRECIO_PROMEDIO_CHRONUS_POR_LITRO = 5.2;

const UNIT_COPY: Record<UnidadKey, { title: string; description: string }> = {
  repuestos: {
    title: "Repuestos",
    description: "Ventas netas por marca, cumplimiento y cartera de Repuestos.",
  },
  lubfiltros: {
    title: "Lubricantes y filtros",
    description: "Venta de lubricantes y filtros por separado, marcas e inventario disponible.",
  },
  servicios: {
    title: "Servicios",
    description: "Actividad de talleres y CSA, servicios internos y cumplimiento comercial.",
  },
  equipos: {
    title: "Equipos",
    description: "Ventas por marca, inventario, oportunidades perdidas y cartera.",
  },
  alquiler: {
    title: "Alquiler",
    description: "Facturación, cumplimiento de la meta y cuentas por cobrar.",
  },
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const label = (value: unknown) => String(value ?? "Sin clasificar");
const BRAND_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function BrandShareBars({
  data,
  total,
  hasNegativeAmounts,
}: {
  data: { marca: string; monto: number }[];
  total: number;
  hasNegativeAmounts: boolean;
}) {
  return (
    <div className="ccv-unit-brand-share min-w-0 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Participación por marca</h3>
      <p className="mt-1 text-xs text-muted-foreground">Ventas positivas · {money(total)}</p>
      <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto" aria-label="Participación por marca">
        {data.map((brand, index) => {
          const share = total > 0 ? brand.monto / total * 100 : 0;
          const color = BRAND_CHART_COLORS[index % BRAND_CHART_COLORS.length];
          return <li key={brand.marca}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium" title={brand.marca}>{brand.marca}</span>
              <span className="shrink-0 font-mono tabular-nums">{money(brand.monto)} <span className="text-muted-foreground">{share.toFixed(1)}%</span></span>
            </div>
            <div className="ccv-brand-share-track mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${brand.marca} de ventas positivas`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-valuetext={`${share.toFixed(1)}%, ${money(brand.monto)}`}>
              <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
            </div>
          </li>;
        })}
      </ul>
      {hasNegativeAmounts && (
        <p className="mt-3 text-xs leading-4 text-muted-foreground">
          Los montos netos negativos se muestran como ajustes y no forman parte de las participaciones.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </header>
  );
}

function ServiceMonthlyChart({
  title,
  total,
  data,
  color,
  highlightMonths,
  loading,
  kind,
  dashed = false,
}: {
  title: string;
  total: number;
  data: { mes: string; monto: number }[];
  color: string;
  highlightMonths: string[];
  loading: boolean;
  kind: "area" | "line" | "bar";
  dashed?: boolean;
}) {
  const hasHighlight = highlightMonths.length > 0;
  const hasData = data.some((row) => row.monto !== 0);
  const selectedPoints = data.filter((row) => highlightMonths.includes(row.mes));
  const guides = selectedPoints.map((row) => (
    <Fragment key={row.mes}>
      <ReferenceLine x={row.mes} stroke={color} strokeDasharray="3 4" strokeOpacity={0.35} />
      <ReferenceDot x={row.mes} y={row.monto} r={4} fill={color} stroke="var(--color-card)" strokeWidth={2} />
    </Fragment>
  ));

  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 card-elevated">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <strong className="font-mono text-base tabular-nums">{money(total)}</strong>
      </div>
      {loading ? <p className="mt-3 flex h-40 items-center justify-center text-sm text-muted-foreground">Cargando tendencia anual…</p> : hasData ? <div className="mt-2 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="monto" name={title} fill={color} radius={[3, 3, 0, 0]}>
                {data.map((row) => (
                  <Cell key={row.mes} fill={color} opacity={!hasHighlight || highlightMonths.includes(row.mes) ? 1 : 0.24} />
                ))}
              <LabelList dataKey="monto" position="top" formatter={(value: number) => moneyShort(value)} fill={color} fontSize={9} />
              </Bar>
            </BarChart>
          ) : kind === "line" ? (
            <LineChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
              <Tooltip formatter={(value) => money(Number(value))} />
              {guides}
              <Line type="monotone" dataKey="monto" name={title} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "5 4" : undefined} dot={{ r: 2, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }}>
                <LabelList dataKey="monto" position="top" formatter={(value: number) => moneyShort(value)} fill={color} fontSize={9} />
              </Line>
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
              <Tooltip formatter={(value) => money(Number(value))} />
              {guides}
              <Area type="monotone" dataKey="monto" name={title} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "5 4" : undefined} fill={color} fillOpacity={0.14} activeDot={{ r: 4 }}>
                <LabelList dataKey="monto" position="top" formatter={(value: number) => moneyShort(value)} fill={color} fontSize={9} />
              </Area>
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div> : <p className="mt-3 flex h-40 items-center justify-center text-sm text-muted-foreground">Sin datos mensuales para graficar.</p>}
    </article>
  );
}

function WorkshopSalesTypeChart({
  data,
  highlightMonths,
  loading,
}: {
  data: { mes: string; internas: number; externas: number; sinTipo: number }[];
  highlightMonths: string[];
  loading: boolean;
}) {
  const hasData = data.some((row) => row.internas || row.externas || row.sinTipo);
  const areas = [
    { key: "internas" as const, name: "Internas · tipo distinto de 4", color: "var(--color-chart-1)" },
    { key: "externas" as const, name: "Externas · tipo 4", color: "var(--color-chart-2)" },
    { key: "sinTipo" as const, name: "Sin tipo registrado", color: "var(--color-chart-3)" },
  ];

  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 card-elevated">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm font-semibold">Talleres · ventas por tipo</h3>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {areas.map((area) => (
            <span key={area.key} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: area.color }} />
              {area.name}
            </span>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="mt-3 flex h-40 items-center justify-center text-sm text-muted-foreground">Cargando tendencia anual…</p>
      ) : hasData ? (
        <div className="mt-2 h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
              <Tooltip formatter={(value, name) => [money(Number(value)), String(name)]} />
              {highlightMonths.map((month) => (
                <ReferenceLine key={month} x={month} stroke="var(--color-foreground)" strokeDasharray="3 4" strokeOpacity={0.35} />
              ))}
              {areas.map((area) => (
                <Area key={area.key} type="monotone" dataKey={area.key} name={area.name} stackId="ventas" stroke={area.color} fill={area.color} fillOpacity={0.82} strokeWidth={1.5}>
                  <LabelList dataKey={area.key} position="insideTop" formatter={(value: number) => value > 0 ? moneyShort(value) : ""} fill="var(--color-card)" fontSize={8} />
                </Area>
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 flex h-40 items-center justify-center text-sm text-muted-foreground">Sin datos mensuales para graficar.</p>
      )}
    </article>
  );
}

function etiquetaLineaLubFiltros(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lubricantes") return "Lubricantes · Chronus / CO";
  if (normalized === "filtros") return "Filtros · Donaldson / DN, D1, GF, NC";
  return value;
}

function familiaMarcaLubFiltros(value: string): "Lubricantes" | "Filtros" | "Otros" {
  const marca = value.trim().toLowerCase();
  const codigo = marca.replace(/[^a-z0-9]/g, "").toUpperCase();
  if (marca.includes("chronus") || codigo === "CO") return "Lubricantes";
  if (marca.includes("donaldson") || ["DN", "D1", "GF", "NC"].includes(codigo)) return "Filtros";
  return "Otros";
}

function DetailSection({
  data,
  annualData,
  trendLoading,
  keyName,
  role,
  year,
  selectedMonths,
}: {
  data: UnidadData;
  annualData?: UnidadData;
  trendLoading: boolean;
  keyName: UnidadKey;
  role: AppRole | null;
  year: number;
  selectedMonths: FilterState["meses"];
}) {
  const brands = useMemo(() => {
    const rows = data.detallesMarcas ?? [];
    const totals = new Map<string, { marca: string; monto: number; sucursales: Map<string, { nombre: string; monto: number }> }>();
    rows.forEach((row) => {
      const amount = num(row.montoTotal ?? row.monto);
      const marca = label(row.marca);
      const sucursal = label(row.sucursal ?? (row.sucursalId ? "Sucursal sin nombre" : "Consolidado histórico"));
      const sucursalKey = String(row.sucursalId ?? sucursal);
      const brand = totals.get(marca) ?? { marca, monto: 0, sucursales: new Map() };
      const branch = brand.sucursales.get(sucursalKey) ?? { nombre: sucursal, monto: 0 };
      brand.monto += amount;
      branch.monto += amount;
      brand.sucursales.set(sucursalKey, branch);
      totals.set(marca, brand);
    });
    return [...totals.values()]
      .map((brand) => ({ ...brand, sucursales: [...brand.sucursales.values()].sort((a, b) => b.monto - a.monto) }))
      .sort((a, b) => b.monto - a.monto);
  }, [data.detallesMarcas]);

  const brandShare = useMemo(() => {
    const chartData = brands
      .filter((brand) => brand.monto > 0)
      .map(({ marca, monto }) => ({ marca, monto }));
    const total = chartData.reduce((sum, brand) => sum + brand.monto, 0);
    const percentages = new Map(
      chartData.map((brand) => [brand.marca, total > 0 ? (brand.monto / total) * 100 : 0]),
    );
    return {
      chartData,
      total,
      percentages,
      hasNegativeAmounts: brands.some((brand) => brand.monto < 0),
    };
  }, [brands]);

  const brandLines = useMemo(() => {
    const groups = [
      { id: "lubricantes", title: "Lubricantes · Chronus / CO", matches: (name: string) => familiaMarcaLubFiltros(name) === "Lubricantes" },
      { id: "filtros", title: "Filtros · Donaldson / DN, D1, GF, NC", matches: (name: string) => familiaMarcaLubFiltros(name) === "Filtros" },
      { id: "otros", title: "Otros / sin clasificar", matches: (name: string) => familiaMarcaLubFiltros(name) === "Otros" },
    ];
    return groups.map((group) => {
      const items = brands.filter((brand) => group.matches(brand.marca));
      return { ...group, brands: items, monto: items.reduce((sum, brand) => sum + brand.monto, 0) };
    }).filter((group) => group.brands.length > 0);
  }, [brands]);

  // Participación (%) de cada marca top sobre el TOTAL de todas las marcas
  // del período filtrado (no solo el subconjunto top-8) -- misma forma que
  // SucursalPerformanceChart (barra que se llena hacia el 100%, color por
  // umbral), reusada aquí en vez de un gráfico de línea nuevo.
  const brandPerformance = useMemo(() => {
    const rows = data.detallesMarcas ?? [];
    const totalGeneral = rows.reduce((sum, row) => sum + num(row.montoTotal ?? row.monto), 0);
    return brands.slice(0, 8).map(({ marca, monto }) => ({
      nombre: marca,
      monto,
      presupuesto: totalGeneral,
      pctCumplimiento: totalGeneral > 0 ? (monto / totalGeneral) * 100 : 0,
    }));
  }, [brands, data.detallesMarcas]);

  const inventory = useMemo(() => {
    const totals = new Map<string, number>();
    (data.inventario ?? []).forEach((row) => {
      const name = label(row.tipo ?? row.tipoEquipo);
      const amount = num(row.disponible ?? row.monto);
      totals.set(name, (totals.get(name) ?? 0) + amount);
    });
    return [...totals.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [data.inventario]);
  const maxInventory = inventory[0]?.[1] ?? 0;

  const inventarioPorSucursal = useMemo(() => {
    const map = new Map<string, { tipo: string; sucursal: string; monto: number }>();
    (data.inventario ?? []).forEach((row) => {
      const tipo = label(row.tipo);
      const sucursal = label(row.sucursal);
      if (!row.sucursal) return;
      const monto = num(row.monto);
      const key = `${tipo}|${sucursal}`;
      const existing = map.get(key);
      if (existing) existing.monto += monto;
      else map.set(key, { tipo, sucursal, monto });
    });
    return [...map.values()].filter((row) => row.monto > 0).sort((a, b) => b.monto - a.monto);
  }, [data.inventario]);

  const serviceTotals = useMemo(() => {
    const rows = data.servicios ?? [];
    // "X" es el valor por defecto de derivarCsaTaller() cuando la fila NO
    // pertenece a un taller/CSA identificado -- filtrar solo por verdad-o-falso
    // hacia que ambos totales sumaran las mismas filas (todas), dando el mismo
    // monto para Talleres y CSA.
    const talleres = rows
      .filter((row) => row.taller && row.taller !== "X")
      .reduce((sum, row) => sum + num(row.monto), 0);
    const csa = rows.filter((row) => row.csa === "CSA").reduce((sum, row) => sum + num(row.monto), 0);
    const interno = (data.serviciosInterno ?? []).reduce((sum, row) => sum + num(row.monto), 0);
    const estrategico = (data.detallesEstrategicos ?? []).reduce(
      (sum, row) => sum + num(row.monto),
      0,
    );
    return { talleres, csa, interno, estrategico };
  }, [data.detallesEstrategicos, data.servicios, data.serviciosInterno]);

  const serviceTrends = useMemo(() => {
    const rows = MESES.map((mes) => ({ mes: mes.slice(0, 3), talleres: 0, talleresInternas: 0, talleresExternas: 0, talleresSinTipo: 0, csa: 0, interno: 0, estrategico: 0 }));
    (annualData?.servicios ?? []).forEach((row) => {
      const month = new Date(String(row.fecha)).getUTCMonth();
      if (!Number.isInteger(month) || month < 0 || month >= rows.length) return;
      const amount = num(row.monto);
      if (row.taller && row.taller !== "X") {
        rows[month].talleres += amount;
        if (row.tipoVentaReporte == null || String(row.tipoVentaReporte).trim() === "") rows[month].talleresSinTipo += amount;
        else if (num(row.tipoVentaReporte) === 4) rows[month].talleresExternas += amount;
        else rows[month].talleresInternas += amount;
      }
      if (row.csa === "CSA") rows[month].csa += amount;
    });
    (annualData?.serviciosInterno ?? []).forEach((row) => {
      const month = Number(row.mes) - 1;
      if (month >= 0 && month < rows.length) rows[month].interno += num(row.monto);
    });
    (annualData?.detallesEstrategicos ?? []).forEach((row) => {
      const month = Number(row.mes) - 1;
      if (month >= 0 && month < rows.length) rows[month].estrategico += num(row.monto);
    });
    return rows;
  }, [annualData?.detallesEstrategicos, annualData?.servicios, annualData?.serviciosInterno]);

  const externalWorkshopServices = useMemo(() => {
    const orders = new Map<string, { id: string; numero: string; taller: string; cliente: string; monto: number }>();
    for (const row of data.servicios ?? []) {
      if (!row.taller || row.taller === "X" || num(row.tipoVentaReporte) !== 4) continue;
      const numero = String(row.numeroServicio ?? "").trim();
      if (!numero) continue;
      const taller = label(row.taller);
      const key = `${String(row.sucursalId ?? "")}:${numero}:${taller}`;
      const order = orders.get(key) ?? { id: key, numero, taller, cliente: label(row.cliente), monto: 0 };
      order.monto += num(row.monto);
      orders.set(key, order);
    }
    return [...orders.values()].sort((a, b) => b.monto - a.monto);
  }, [data.servicios]);

  const lostSales = useMemo(
    () =>
      (data.ventasPerdidas ?? [])
        .map((row) => ({ cliente: label(row.cliente), razon: label(row.razon), monto: num(row.monto) }))
        .slice(0, 8),
    [data.ventasPerdidas],
  );

  if (keyName === "alquiler") return null;

  if (keyName === "servicios") {
    return (
      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <SectionTitle
          title="Detalles comerciales de Servicios"
          description={`Evolución mensual de las fuentes comerciales de Servicios · ${year}.`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ServiceMonthlyChart kind="area" title="Talleres" total={serviceTotals.talleres} data={serviceTrends.map(({ mes, talleres }) => ({ mes, monto: talleres }))} color="var(--color-chart-1)" highlightMonths={getHighlightMonthLabels(selectedMonths)} loading={trendLoading} />
          <ServiceMonthlyChart kind="line" title="CSA" total={serviceTotals.csa} data={serviceTrends.map(({ mes, csa }) => ({ mes, monto: csa }))} color="var(--color-chart-2)" highlightMonths={getHighlightMonthLabels(selectedMonths)} loading={trendLoading} />
          <ServiceMonthlyChart kind="bar" title="Servicios internos" total={serviceTotals.interno} data={serviceTrends.map(({ mes, interno }) => ({ mes, monto: interno }))} color="var(--color-chart-3)" highlightMonths={getHighlightMonthLabels(selectedMonths)} loading={trendLoading} />
          <ServiceMonthlyChart kind="line" dashed title="Estratégicos" total={serviceTotals.estrategico} data={serviceTrends.map(({ mes, estrategico }) => ({ mes, monto: estrategico }))} color="var(--color-chart-4)" highlightMonths={getHighlightMonthLabels(selectedMonths)} loading={trendLoading} />
        </div>
        <p className="text-xs text-muted-foreground">
          Las fuentes de Servicios internos y Estratégicos no guardan el año en PostgreSQL; sus gráficos muestran la distribución mensual registrada, no una comparación histórica anual.
        </p>
        <div className="grid gap-3">
          <WorkshopSalesTypeChart data={serviceTrends.map(({ mes, talleresInternas, talleresExternas, talleresSinTipo }) => ({ mes, internas: talleresInternas, externas: talleresExternas, sinTipo: talleresSinTipo }))} highlightMonths={getHighlightMonthLabels(selectedMonths)} loading={trendLoading} />
        </div>
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Servicios externos de talleres · {externalWorkshopServices.length} órdenes</summary>
          <div className="max-h-96 overflow-auto border-t border-border">
            <Table>
              <caption className="sr-only">Servicios de taller con tipo de venta 4 en el período seleccionado</caption>
              <TableHeader><TableRow><TableHead>N.º de servicio</TableHead><TableHead>Taller</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
              <TableBody>
                {externalWorkshopServices.map((order) => <TableRow key={order.id}><TableCell className="font-mono text-xs">{order.numero}</TableCell><TableCell>{order.taller}</TableCell><TableCell className="max-w-64 truncate" title={order.cliente}>{order.cliente}</TableCell><TableCell className="text-right tabular-nums">{money(order.monto)}</TableCell></TableRow>)}
                {externalWorkshopServices.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No hay servicios externos de talleres con número en este período.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </details>
      </section>
    );
  }

  if (keyName === "equipos") {
    return (
      <section className="grid gap-4 lg:grid-cols-2 section-enter section-enter-3">
        <div className="rounded-xl border bg-card p-4 card-elevated">
          <SectionTitle title="Inventario por tipo" description="Disponible y tránsito desde el snapshot de inventario." />
          <div className="ccv-unit-inventory-list mt-4 space-y-3">
            {inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay inventario para el alcance seleccionado.</p>
            ) : (
              inventory.map(([name, amount]) => (
                <div key={name} className="ccv-unit-inventory-row border-b pb-2 text-sm last:border-0">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 font-mono tabular-nums">{money(amount)}</span>
                  </div>
                  <div className="ccv-unit-inventory-track mt-2" aria-hidden="true">
                    <span style={{ width: `${maxInventory > 0 ? Math.min(100, Math.max(0, amount / maxInventory * 100)) : 0}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 card-elevated">
          <SectionTitle title="Ventas perdidas" description="Clientes y razones con mayor monto perdido en el período." />
          <div className="mt-4 space-y-3">
            {lostSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay ventas perdidas para el período.</p>
            ) : (
              lostSales.map((row, index) => (
                <div key={`${row.cliente}-${index}`} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.cliente}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.razon}</p>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums">{money(row.monto)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid items-start gap-4 lg:grid-cols-2 section-enter section-enter-3">
      <div className="rounded-xl border bg-card p-4 card-elevated">
        <SectionTitle
          title={keyName === "lubfiltros" ? "Lubricantes y filtros por separado" : keyName === "repuestos" ? "Ventas netas por marca" : "Ventas por marca"}
          description={
            keyName === "repuestos"
              ? role === "coordinador"
                ? "Ventas netas por marca en tus sucursales. Los datos históricos sin sucursal no se atribuyen a tu alcance. El año corresponde al lote de carga, no al año de venta."
                : "Ventas netas por marca y sucursal; los registros históricos sin sucursal quedan consolidados. El año corresponde al lote de carga, no al año de venta."
              : role === "coordinador"
                ? "Chronus / CO se agrupa como lubricantes; Donaldson / DN, D1, GF y NC como filtros. Solo tus sucursales; los registros históricos sin sucursal no se atribuyen a tu alcance."
                : "Chronus / CO se agrupa como lubricantes; Donaldson / DN, D1, GF y NC como filtros. El detalle respeta las sucursales permitidas para tu rol."
          }
        />
        <div className="mt-4 grid items-start gap-4 min-[680px]:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div className="ccv-brand-breakdown mt-0">
            {brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {role === "coordinador" && keyName === "repuestos"
                  ? "No hay ventas de Repuestos con sucursal asignada en tus sucursales para este período."
                  : role === "coordinador" && keyName === "lubfiltros"
                  ? "No hay ventas de Lubricantes/Filtros con sucursal asignada en tus sucursales para este período."
                  : "No hay detalle de marcas para el período y año de carga seleccionados."}
              </p>
            ) : keyName === "lubfiltros" ? (
              <div className="space-y-3">
                {brandLines.map((group, groupIndex) => (
                  <section key={group.id} className="rounded-lg border bg-card p-3">
                    <header className="mb-2 flex items-center justify-between gap-3 border-b pb-2">
                      <h3 className="text-sm font-semibold">{group.title}</h3>
                      <span className="font-mono text-sm font-semibold tabular-nums">{money(group.monto)}</span>
                    </header>
                    {group.brands.map((brand) => {
                      const share = group.monto > 0 ? (brand.monto / group.monto) * 100 : null;
                      const color = BRAND_CHART_COLORS[groupIndex % BRAND_CHART_COLORS.length];
                      return (
                        <details key={brand.marca} className="ccv-brand-row">
                          <summary>
                            <span className="flex min-w-0 items-start gap-2">
                              <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{brand.marca}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">{brand.sucursales.length} {brand.sucursales.length === 1 ? "origen" : "orígenes"} · ver sucursales</span>
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end">
                              <span className="font-mono font-semibold tabular-nums">{money(brand.monto)}</span>
                              <span className="text-xs font-semibold tabular-nums" style={{ color }}>{share == null ? "Ajuste neto" : `${share.toFixed(1)}% de la línea`}</span>
                            </span>
                          </summary>
                          <ul>{brand.sucursales.map((branch) => <li key={branch.nombre}><span>{branch.nombre}</span><span className="font-mono tabular-nums">{money(branch.monto)}</span></li>)}</ul>
                        </details>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              brands.map((brand, index) => {
                const share = brandShare.percentages.get(brand.marca);
                return (
                  <details key={brand.marca} className="ccv-brand-row">
                    <summary>
                      <span className="flex min-w-0 items-start gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: BRAND_CHART_COLORS[index % BRAND_CHART_COLORS.length] }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{brand.marca}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {brand.sucursales.length} {brand.sucursales.length === 1 ? "origen" : "orígenes"} · ver sucursales
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="font-mono font-semibold tabular-nums">{money(brand.monto)}</span>
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: BRAND_CHART_COLORS[index % BRAND_CHART_COLORS.length] }}
                        >
                          {share == null ? "Ajuste neto" : `${share.toFixed(1)}%`}
                        </span>
                      </span>
                    </summary>
                    <ul>
                      {brand.sucursales.map((branch) => (
                        <li key={branch.nombre}>
                          <span>{branch.nombre}</span>
                          <span className="font-mono tabular-nums">{money(branch.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })
            )}
          </div>
          {brandShare.chartData.length > 0 && (
            <BrandShareBars
              data={brandShare.chartData}
              total={brandShare.total}
              hasNegativeAmounts={brandShare.hasNegativeAmounts}
            />
          )}
        </div>
      </div>
      {keyName === "lubfiltros" ? (
        <div className="flex flex-col overflow-hidden rounded-xl border bg-card card-elevated">
          <div className="p-4">
            <SectionTitle title="Inventario por sucursal" description="CO corresponde a Lubricantes / Chronus; DN, D1, GF y NC corresponden a Filtros / Donaldson. Los montos en cero no se listan." />
          </div>
          <div className="[&_[data-slot=table-container]]:max-h-[16rem] [&_[data-slot=table-container]]:overflow-y-auto">
            <Table className="table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col />
                <col className="w-36" />
              </colgroup>
              <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-2 text-left text-xs font-medium text-primary-foreground">Línea y códigos</TableHead>
                  <TableHead className="px-4 py-2 text-left text-xs font-medium text-primary-foreground">Sucursal</TableHead>
                  <TableHead className="px-4 py-2 text-right text-xs font-medium text-primary-foreground">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventarioPorSucursal.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="px-4 py-6 text-sm text-muted-foreground">
                      No hay inventario disponible.
                    </TableCell>
                  </TableRow>
                ) : (
                  inventarioPorSucursal.map((row) => (
                    <TableRow key={`${row.tipo}|${row.sucursal}`}>
                      <TableCell className="px-4 py-2.5 font-medium">{etiquetaLineaLubFiltros(row.tipo)}</TableCell>
                      <TableCell className="px-4 py-2.5">{row.sucursal}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right font-mono tabular-nums">{money(row.monto)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Table className="mt-auto table-fixed border-t text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col />
              <col className="w-36" />
            </colgroup>
            <TableBody>
              {(
                [
                  ["Lubricantes · Chronus / CO", inventory.find(([name]) => name === "Lubricantes")?.[1] ?? 0],
                  ["Filtros · Donaldson / DN, D1, GF, NC", inventory.find(([name]) => name === "Filtros")?.[1] ?? 0],
                  ["Total", inventory.reduce((sum, [, amount]) => sum + amount, 0)],
                ] as const
              ).map(([name, amount]) => (
                <TableRow key={name} className="hover:bg-transparent">
                  <TableCell className="px-4 py-2 font-medium">{name}</TableCell>
                  <TableCell className="px-4 py-2" />
                  <TableCell className={`px-4 py-2 text-right font-mono tabular-nums ${name === "Total" ? "font-semibold" : ""}`}>
                    {money(amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : brandPerformance.length > 0 ? (
        <SucursalPerformanceChart data={brandPerformance} title="Cumplimiento por marca" />
      ) : null}
    </section>
  );
}

export default function UnidadLivePage({ unitKey }: { unitKey: UnidadKey }) {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const { data: sucursales } = useSucursales();
  const [search, setSearch] = useState("");
  const branch = isFullAccessRole(role) || role === "gerente_comercial"
    ? filters.sucursales[0]
    : undefined;
  const copy = UNIT_COPY[unitKey];

  const { data, isLoading, error } = useQuery({
    queryKey: ["unidad-http", unitKey, anio, JSON.stringify(meses), branch, role, profile?.id],
    queryFn: () => getUnidadData(unitKey, { anio, meses, sucursalId: branch }),
  });
  const serviceTrendQuery = useQuery({
    queryKey: ["unidad-servicios-tendencia", anio, branch, role, profile?.id],
    queryFn: () => getUnidadData("servicios", { anio, meses: "all", sucursalId: branch }),
    enabled: unitKey === "servicios",
  });
  const lubFiltrosPlanQuery = useQuery({
    queryKey: ["unidad-lubfiltros-presupuesto-lineas", anio, role, profile?.id],
    queryFn: () => getUnidadData("lubfiltros", { anio, meses: Array.from({ length: 12 }, (_, index) => index + 1) }),
    enabled: unitKey === "lubfiltros" && anio === 2026,
  });

  const selectedBudgets = data?.presupuestos ?? [];
  const sales = selectedBudgets.reduce(
    (sum, row) => sum + num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas),
    0,
  );
  const planBranchIds = sucursales?.map((item) => item.id) ?? [];
  const plannedMonths = useMemo(() => {
    const lineBudgets = lubFiltrosPlanQuery.data?.presupuestosLineas;
    if (unitKey !== "lubfiltros" || anio !== 2026 || !lineBudgets?.length) return null;
    const months = new Map<number, NonNullable<UnidadData["presupuestosLineas"]>>();
    for (const row of lineBudgets) {
      const rows = months.get(row.mes) ?? [];
      rows.push(row);
      months.set(row.mes, rows);
    }
    return new Map([...months.entries()].map(([month, rows]) => [month, { branches: rows }]));
  }, [unitKey, anio, lubFiltrosPlanQuery.data?.presupuestosLineas]);
  const selectedPlanBranchIds = branch ? [branch] : planBranchIds;
  const selectedPlanMonths = meses === "all" ? Array.from({ length: 12 }, (_, index) => index + 1) : meses;
  const plannedLineTotals = useMemo(() => {
    if (!plannedMonths) return null;
    return selectedPlanMonths.reduce((total, month) => {
      const distribution = plannedMonths.get(month);
      const branches = distribution?.branches.filter((row) => selectedPlanBranchIds.includes(row.sucursalId)) ?? [];
      return {
        chronusUsd: total.chronusUsd + branches.reduce((sum, row) => sum + row.chronusUsd, 0),
        chronusLitros: total.chronusLitros + branches.reduce((sum, row) => sum + row.chronusLitros, 0),
        donaldsonUsd: total.donaldsonUsd + branches.reduce((sum, row) => sum + row.donaldsonUsd, 0),
      };
    }, { chronusUsd: 0, chronusLitros: 0, donaldsonUsd: 0 });
  }, [plannedMonths, selectedPlanMonths.join(","), selectedPlanBranchIds.join("|")]);
  const target = plannedLineTotals
    ? plannedLineTotals.chronusUsd + plannedLineTotals.donaldsonUsd
    : selectedBudgets.reduce((sum, row) => sum + num(row.monto), 0);
  const compliance = target > 0 ? (sales / target) * 100 : 0;
  const projection = getMonthlySalesProjection(sales, target, anio, meses);
  const monthly = useMemo(() => {
    const rows = Array.from({ length: getAllMonthsCap(anio) }, (_, index) => ({
      mes: MESES[index].slice(0, 3),
      presupuesto: 0,
      venta: 0,
    }));
    (data?.presupuestosYtd ?? []).forEach((row) => {
      const position = row.mes - 1;
      if (!rows[position]) return;
      rows[position].presupuesto += num(row.monto);
      rows[position].venta += num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas);
    });
    if (plannedMonths) {
      rows.forEach((row, index) => {
        const distribution = plannedMonths.get(index + 1);
        const branches = distribution?.branches.filter((item) => selectedPlanBranchIds.includes(item.sucursalId)) ?? [];
        row.presupuesto = branches.reduce((sum, item) => sum + item.montoTotal, 0);
      });
    }
    return rows;
  }, [anio, data?.presupuestosYtd, plannedMonths, selectedPlanBranchIds.join("|")]);
  const monthlyBrandLines = useMemo<MonthlyMarcaRow[]>(() => {
    const rows: MonthlyMarcaRow[] = Array.from({ length: getAllMonthsCap(anio) }, (_, index) => ({ mes: MESES[index].slice(0, 3), Lubricantes: 0, Filtros: 0, Otros: 0 }));
    const brandRows = plannedMonths ? lubFiltrosPlanQuery.data?.detallesMarcas ?? [] : data?.detallesMarcas ?? [];
    brandRows.filter((row) => !branch || String(row.sucursalId ?? "") === branch).forEach((row) => {
      const month = Number(row.mes) - 1;
      if (month < 0 || month >= rows.length) return;
      rows[month][familiaMarcaLubFiltros(label(row.marca))] += num(row.montoTotal ?? row.monto);
    });
    if (plannedMonths) {
      rows.forEach((row, index) => {
        const distribution = plannedMonths.get(index + 1);
        const branches = distribution?.branches.filter((item) => selectedPlanBranchIds.includes(item.sucursalId)) ?? [];
        row.MetaLubricantes = branches.reduce((sum, item) => sum + item.chronusUsd, 0);
        row.MetaFiltros = branches.reduce((sum, item) => sum + item.donaldsonUsd, 0);
      });
    }
    return rows;
  }, [anio, data?.detallesMarcas, lubFiltrosPlanQuery.data?.detallesMarcas, plannedMonths, branch, selectedPlanBranchIds.join("|")]);
  const companies = useMemo(() => {
    const totals: [string, number][] = [
      ["Consorcio Venequip", selectedBudgets.reduce((sum, row) => sum + num(row.ventasCcv), 0)],
      ["Xibi", selectedBudgets.reduce((sum, row) => sum + num(row.ventasXibi), 0)],
      ["Estratégicas", selectedBudgets.reduce((sum, row) => sum + num(row.ventasEstrategicas), 0)],
    ];
    return totals.filter(([, value]) => num(value) > 0).map(([label, value]) => ({ label, facturado: num(value) }));
  }, [selectedBudgets]);
  const performance = useMemo(() => {
    const map = new Map<string, { nombre: string; monto: number; presupuesto: number }>();
    (sucursales ?? []).filter((item) => !branch || item.id === branch).forEach((item) => map.set(item.id, { nombre: item.nombre, monto: 0, presupuesto: 0 }));
    selectedBudgets.forEach((row) => {
      if (!row.sucursalId || !map.has(row.sucursalId)) return;
      const item = map.get(row.sucursalId)!;
      item.monto += num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas);
      item.presupuesto += num(row.monto);
    });
    if (plannedMonths) {
      map.forEach((item, id) => {
        item.presupuesto = selectedPlanMonths.reduce((sum, month) => {
          const plan = plannedMonths.get(month)?.branches.find((row) => row.sucursalId === id);
          return sum + (plan?.montoTotal ?? 0);
        }, 0);
      });
    }
    return [...map.values()]
      .filter((item) => item.monto > 0 || item.presupuesto > 0)
      .map((item) => ({ ...item, pctCumplimiento: item.presupuesto ? (item.monto / item.presupuesto) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }, [selectedBudgets, sucursales, plannedMonths, selectedPlanMonths.join(","), branch]);
  const receivables = useMemo(
    () =>
      (data?.cobranzas ?? [])
        .filter((row) => label(row.cliente).toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => num(b.saldo) - num(a.saldo)),
    [data?.cobranzas, search],
  );
  const lubFiltrosActuals = useMemo(() => {
    const totals = { chronusUsd: 0, donaldsonUsd: 0 };
    (data?.detallesMarcas ?? []).forEach((row) => {
      const amount = num(row.montoTotal ?? row.monto);
      const family = familiaMarcaLubFiltros(label(row.marca));
      if (family === "Lubricantes") totals.chronusUsd += amount;
      if (family === "Filtros") totals.donaldsonUsd += amount;
    });
    return totals;
  }, [data?.detallesMarcas]);
  const litersNumber = (value: number) => new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(Math.round(value));

  const handleApplyFilters = (next: FilterState) => {
    setFilters({ anio: next.anio, meses: next.meses, sucursales: next.sucursal ? [next.sucursal] : [] });
  };

  if (isLoading && !data) {
    return <div role="status" aria-label={`Cargando ${copy.title}`}><PageSkeleton kpis={2} blocks={[{ cols: 1, height: 240 }, { cols: 2, height: 280 }]} /></div>;
  }
  if (error) {
    return <div role="alert" className="ccv-unit-error p-6 text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo cargar la unidad."}</div>;
  }

  return (
    <div className="ccv-unit-page" data-unit={unitKey}>
      <header className="ccv-unit-heading">
        <div>
          <p className="ccv-unit-heading-context">Unidad de negocio <span aria-hidden="true">/</span> Resultado comercial</p>
          <h1>{copy.title}</h1>
          <p className="ccv-unit-heading-description">{copy.description}</p>
        </div>
        <span className="ccv-unit-heading-period">{anio} · {getHighlightMonthLabels(meses).join(", ") || "Año completo"}</span>
      </header>
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={isFullAccessRole(role) || role === "gerente_comercial" ? sucursales?.map((item) => ({ value: item.id, label: item.nombre })) : undefined}
        defaultMes={meses}
        defaultAnio={anio}
        showAllMonths
      />

      <section className="ccv-unit-overview" aria-label="Resultado comercial de la unidad">
        <div className="ccv-unit-overview-main">
          <p className="ccv-unit-overview-label">Facturación del período</p>
          <div className="ccv-unit-overview-result">
            <strong>{money(sales)}</strong>
            <span>{target > 0 ? `${compliance.toLocaleString("es-VE", { maximumFractionDigits: 1 })}% de la meta` : "Sin meta asignada"}</span>
          </div>
          <div className="ccv-unit-overview-track" role="progressbar" aria-label="Cumplimiento de la meta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, compliance))} aria-valuetext={`${compliance.toLocaleString("es-VE", { maximumFractionDigits: 1 })}% de la meta`}>
            <span style={{ width: `${Math.min(100, Math.max(0, compliance))}%` }} />
          </div>
          <div className="ccv-unit-overview-meta">
            <div><span>Meta del período</span><strong>{money(target)}</strong></div>
            <div><span>Falta para la meta</span><strong>{money(Math.max(0, target - sales))}</strong></div>
            {projection && <div><span>Proyección de cierre</span><strong>{money(projection.projectedSales)}</strong></div>}
          </div>
        </div>
        <div className="ccv-unit-overview-aside">
          <article>
            <p>Cotizado neto</p>
            <strong>{money(num(data?.cotizado.montoTotal))}</strong>
            <span>{num(data?.cotizado.cantidad)} cotizaciones</span>
          </article>
          <article>
            <p>Cuentas por cobrar</p>
            <strong>{money((data?.cobranzas ?? []).reduce((sum, row) => sum + num(row.saldo), 0))}</strong>
            <span>{data?.cobranzas.length ?? 0} saldos pendientes</span>
          </article>
        </div>
      </section>

      {unitKey === "lubfiltros" && (
        <section className="flex flex-col gap-3 section-enter section-enter-1" aria-label="Resultado por línea de Lubricantes y Filtros">
          <SectionTitle
            title="Lubricantes y filtros por línea"
            description={anio === 2026
              ? "Meta 2026 distribuida por sucursal y mes, conservando el presupuesto vigente de la base de datos. Chronus usa $5,20 por litro."
              : `Venta por línea. Los litros de Chronus se estiman a $5,20 por litro; no hay metas de línea cargadas para ${anio}.`}
          />
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea</TableHead>
                  <TableHead className="text-right">Facturado</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">Cumplimiento</TableHead>
                  <TableHead className="text-right">Litros vendidos</TableHead>
                  <TableHead className="text-right">Meta litros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Chronus · Lubricantes</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(lubFiltrosActuals.chronusUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{anio === 2026 ? plannedLineTotals ? money(plannedLineTotals.chronusUsd) : "—" : "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {anio === 2026 && plannedLineTotals?.chronusUsd
                      ? `${(lubFiltrosActuals.chronusUsd / plannedLineTotals.chronusUsd * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{litersNumber(lubFiltrosActuals.chronusUsd / PRECIO_PROMEDIO_CHRONUS_POR_LITRO)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{anio === 2026 ? plannedLineTotals ? litersNumber(plannedLineTotals.chronusLitros) : "—" : "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Donaldson · Filtros</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(lubFiltrosActuals.donaldsonUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{anio === 2026 ? plannedLineTotals ? money(plannedLineTotals.donaldsonUsd) : "—" : "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {anio === 2026 && plannedLineTotals?.donaldsonUsd
                      ? `${(lubFiltrosActuals.donaldsonUsd / plannedLineTotals.donaldsonUsd * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {anio === 2026 && !plannedLineTotals && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground" role="status">Cargando la distribución mensual por línea…</p>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <SectionTitle title="Evolución mensual" description={`Venta real vs. presupuesto, año a la fecha · ${getHighlightMonthLabels(meses).join(", ") || "todos los meses"} en revisión.`} />
        <div className={unitKey === "lubfiltros" ? "grid gap-4 xl:grid-cols-2" : ""}>
          <GlobalMonthlyCombo data={monthly} highlightMonths={getHighlightMonthLabels(meses)} />
          {unitKey === "lubfiltros" && <MarcasMonthlyChart data={monthlyBrandLines} title={plannedMonths ? "Ventas y metas mensuales por línea" : "Ventas mensuales por línea"} highlightMonths={getHighlightMonthLabels(meses)} />}
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <SectionTitle title="Desempeño por sucursal" description="Facturación por compañía y cumplimiento de las sucursales." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <UnitDonut data={companies} title="Facturación por compañía" variant="donut" />
          </div>
          <div className="lg:col-span-4">
            <SucursalPerformanceChart data={performance} />
          </div>
        </div>
      </section>

      <DetailSection
        data={data!}
        annualData={serviceTrendQuery.data}
        trendLoading={unitKey === "servicios" && serviceTrendQuery.isLoading}
        keyName={unitKey}
        role={role}
        year={anio}
        selectedMonths={meses}
      />

      <section className="flex flex-col gap-3 section-enter section-enter-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle title="Cuentas por cobrar" description={`Saldos pendientes de ${data?.unit.nombre ?? copy.title}.`} />
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Buscar cliente" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente…" className="h-9 pl-8" />
          </div>
        </div>
        <ReceivablesTable
          rows={receivables.map((row) => ({
            id: row.id,
            cliente: row.cliente,
            sucursalVenta: sucursales?.find((item) => item.id === row.sucursalId)?.nombre,
            diasVencidos: diasVencidosDesde(row.fechaVencimiento || new Date().toISOString()),
            total: num(row.saldo),
          }))}
        />
      </section>

      {isLoading ? <div className="text-xs text-muted-foreground">Actualizando datos…</div> : null}
    </div>
  );
}
