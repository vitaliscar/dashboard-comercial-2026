import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";
import { CompanyTrendChart, type CompanyTrendRow } from "./coordinador/CompanyTrendChart";
import { EquiposAlquilerStacked, type EquiposAlquilerRow } from "./coordinador/EquiposAlquilerStacked";
import { GlobalMonthlyCombo, type MonthlyRow } from "./coordinador/GlobalMonthlyCombo";
import { LubFiltrosComboLines } from "./coordinador/LubFiltrosComboLines";
import { RepuestosAreaChart } from "./coordinador/RepuestosAreaChart";
import { ServiciosBarWithMarkers } from "./coordinador/ServiciosBarWithMarkers";
import { UnitAmountBars } from "./coordinador/UnitAmountBars";
import { ComplianceGauge } from "./gerencia-nacional/ComplianceGauge";
import { UnitDonut } from "./gerencia-nacional/UnitDonut";

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const monthlyData: MonthlyRow[] = months.map((mes, index) => ({
  mes,
  presupuesto: [520, 560, 590, 620, 650, 680, 710, 720, 760, 790, 820, 860][index] * 1000,
  venta: [480, 540, 575, 604, 632, 666, 692, 748, 722, 776, 808, 842][index] * 1000,
}));

const companyTrendData: CompanyTrendRow[] = months.map((mes, index) => ({
  mes,
  ccv: [190, 215, 226, 240, 258, 276, 294, 310, 326, 342, 360, 382][index] * 1000,
  xibi: [120, 132, 141, 152, 164, 172, 186, 198, 208, 219, 230, 242][index] * 1000,
  estrategicas: [92, 101, 108, 116, 124, 132, 142, 150, 158, 168, 178, 188][index] * 1000,
}));

const unitAmounts = [
  { label: "Servicios", facturado: 1_180_000, cumplimiento: 94 },
  { label: "Equipos", facturado: 1_420_000, cumplimiento: 78 },
  { label: "Repuestos", facturado: 940_000, cumplimiento: 86 },
  { label: "Lub / Filtros", facturado: 612_000, cumplimiento: 89 },
  { label: "Alquiler", facturado: 328_000, cumplimiento: 71 },
];

const equipmentRentalData: EquiposAlquilerRow[] = months.map((mes, index) => ({
  mes,
  equiposVenta: [82, 94, 106, 112, 124, 132, 146, 158, 151, 168, 176, 190][index] * 1000,
  alquilerVenta: [24, 28, 31, 34, 38, 40, 42, 48, 45, 51, 54, 58][index] * 1000,
  presupuestoTotal: [118, 126, 138, 150, 164, 176, 190, 202, 208, 224, 238, 254][index] * 1000,
}));

const conversionData = months.map((mes, index) => ({
  mes,
  conversion: [17, 18, 19, 18, 21, 20, 22, 23, 21, 24, 25, 26][index],
  cobro: [62, 65, 64, 67, 69, 68, 71, 72, 74, 73, 76, 78][index],
}));

const conversionConfig = {
  conversion: { label: "Conversión a venta", color: "var(--color-primary)" },
  cobro: { label: "Tasa de cobro", color: "var(--color-success)" },
} satisfies ChartConfig;

const agingData = [
  { label: "Vigente", facturado: 612_000 },
  { label: "1–30 días", facturado: 238_000 },
  { label: "31–60 días", facturado: 158_000 },
  { label: "61–90 días", facturado: 82_000 },
  { label: "+90 días", facturado: 44_000 },
];

const agingConfig = {
  facturado: { label: "Saldo", color: "var(--color-primary)" },
} satisfies ChartConfig;

const agingColors = [
  "var(--color-success)",
  "var(--color-chart-calm-1)",
  "var(--color-warning)",
  "var(--color-chart-calm-3)",
  "var(--color-danger)",
];

function ConversionChart() {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Conversión y cobro mensual</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={conversionConfig} className="aspect-auto h-64 w-full">
          <LineChart data={conversionData} margin={{ top: 14, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={false} axisLine={false} tickLine={false} width={0} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="font-mono font-semibold">{`${name}: ${Number(value).toFixed(1)}%`}</span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line type="monotone" dataKey="conversion" stroke="var(--color-conversion)" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="cobro" stroke="var(--color-cobro)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function AgingChart() {
  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Saldo por antigüedad</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={agingConfig} className="aspect-auto h-64 w-full">
          <BarChart data={agingData} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
            <Tooltip
              formatter={(value: unknown) => `$ ${Math.round(Number(value) / 1000)}K`}
              contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
            />
            <Bar dataKey="facturado" radius={[5, 5, 0, 0]} fill="var(--color-facturado)">
              {agingData.map((item, index) => <Cell key={item.label} fill={agingColors[index]} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function ExecutiveAnalyticsGallery() {
  return (
    <section className="space-y-4" aria-labelledby="executive-analytics-title">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="executive-analytics-title" className="font-display text-xl font-semibold">Analítica ampliada</h3>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Datos demo</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Las visualizaciones que existían en la aplicación importada, recuperadas en la experiencia activa.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[.8fr_1fr_1.2fr]">
        <ComplianceGauge pct={92.4} facturado={618_000} presupuesto={669_000} />
        <UnitDonut data={unitAmounts.map((unit, index) => ({ id: `unit-${index}`, label: unit.label, facturado: unit.facturado }))} title="Composición de ventas por unidad" />
        <CompanyTrendChart data={companyTrendData} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <UnitAmountBars data={unitAmounts} />
        <GlobalMonthlyCombo data={monthlyData} highlightMonths={["Jul", "Ago"]} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EquiposAlquilerStacked data={equipmentRentalData} />
        <ConversionChart />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RepuestosAreaChart data={monthlyData.map((row, index) => ({ ...row, presupuesto: row.presupuesto * 0.22, venta: row.venta * 0.21 + index * 2_000 }))} />
        <ServiciosBarWithMarkers data={monthlyData.map((row) => ({ ...row, presupuesto: row.presupuesto * 0.29, venta: row.venta * 0.31 }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LubFiltrosComboLines data={monthlyData.map((row) => ({ ...row, presupuesto: row.presupuesto * 0.14, venta: row.venta * 0.13 }))} />
        <ConversionChart />
      </div>
    </section>
  );
}

export function FunnelAnalyticsGallery() {
  return (
    <section className="space-y-4" aria-labelledby="funnel-analytics-title">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="funnel-analytics-title" className="font-display text-xl font-semibold">Tendencias del embudo</h3>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Datos demo</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Evolución mensual de cotizado, facturado, conversión y cobro.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConversionChart />
        <GlobalMonthlyCombo data={monthlyData} highlightMonths={["Jul", "Ago"]} />
      </div>
      <UnitAmountBars data={unitAmounts} />
    </section>
  );
}

export function CollectionsAnalyticsGallery() {
  return (
    <section className="space-y-4" aria-labelledby="collections-analytics-title">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="collections-analytics-title" className="font-display text-xl font-semibold">Analítica de cartera</h3>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Datos demo</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Distribución del saldo y evolución de la recuperación.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AgingChart />
        <UnitDonut data={agingData.map((item, index) => ({ id: `aging-${index}`, label: item.label, facturado: item.facturado }))} title="Composición de cartera por tramo" />
      </div>
      <ConversionChart />
    </section>
  );
}