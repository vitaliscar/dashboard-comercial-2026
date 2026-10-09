import { money, MESES } from "@/lib/format";
import type { FacturadoMetrica } from "@/lib/resumen-types";
import { UnitPerformance } from "@/components/resumen/UnitPerformance";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface KpiCardsProps {
  cotizado: number;
  metaMes: number;
  facturado: number;
  facturadoMensual?: number[];
  metaMensual?: number[];
  periodoLabel: string;
  anio: number;
  facturadoVsCotizadoPorcentaje: number;
  cumplimientoMetaPorcentaje: number;
  ventasPerdidas: number;
  ventasPerdidasPorcentaje: number;
  facturadoProjection?: { value: string; tone: "success" | "warning" | "danger" };
  unitRows: FacturadoMetrica[];
}

const compactMoney = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return money(value);
};

export function KpiCards({
  cotizado,
  metaMes,
  facturado,
  facturadoMensual,
  metaMensual,
  periodoLabel,
  anio,
  facturadoVsCotizadoPorcentaje,
  cumplimientoMetaPorcentaje,
  ventasPerdidas,
  ventasPerdidasPorcentaje,
  facturadoProjection,
  unitRows,
}: KpiCardsProps) {
  const gap = Math.max(0, metaMes - facturado);
  const reached = metaMes > 0 && cumplimientoMetaPorcentaje >= 100;
  const data = MESES.map((month, index) => ({
    month: month.slice(0, 3),
    facturado: facturadoMensual?.[index] ?? null,
    meta: metaMensual?.[index] ?? null,
  }));

  return (
    <>
      <section className="ccv-summary-kpis" aria-label="Indicadores del período">
        <article className="ccv-summary-kpi">
          <span>Facturado</span>
          <strong>{money(facturado)}</strong>
          <small>{periodoLabel}</small>
        </article>
        <article className="ccv-summary-kpi">
          <span>Meta y cumplimiento</span>
          <strong>{money(metaMes)}</strong>
          <small>
            {metaMes > 0 ? `${cumplimientoMetaPorcentaje.toFixed(1)}% · ${reached ? `superada por ${money(facturado - metaMes)}` : `faltan ${money(gap)}`}` : "Sin meta configurada"}
          </small>
          {facturadoProjection && <small className={`ccv-summary-projection tone-${facturadoProjection.tone}`}>Proyección: {facturadoProjection.value}</small>}
        </article>
        <article className="ccv-summary-kpi">
          <span>Cotizado</span>
          <strong>{money(cotizado)}</strong>
          <small>Facturado: {facturadoVsCotizadoPorcentaje.toFixed(1)}% del cotizado</small>
        </article>
        <article className="ccv-summary-kpi ccv-summary-kpi-lost">
          <span>Ventas perdidas</span>
          <strong>{money(ventasPerdidas)}</strong>
          <small>{ventasPerdidasPorcentaje.toFixed(1)}% de lo cotizado</small>
        </article>
      </section>

      <div className="ccv-resumen-analytics-grid">
      <section className="ccv-revenue-chart-panel" aria-labelledby="revenue-chart-title">
        <header className="ccv-summary-panel-heading">
          <div>
            <h2 id="revenue-chart-title">Evolución mensual</h2>
            <p>Facturación y meta por mes · {anio}</p>
          </div>
        <div className="ccv-revenue-chart-key" role="group" aria-label="Leyenda del gráfico">
            <span><i className="is-sales" /> Facturado</span>
            <span><i className="is-target" /> Meta</span>
          </div>
        </header>
        <div className="ccv-revenue-chart" role="img" aria-label={`Facturación y meta mensual de enero a diciembre de ${anio}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickMargin={9} />
              <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={compactMoney} />
              <Tooltip
                cursor={{ stroke: "#98a2b3", strokeDasharray: "3 4" }}
                contentStyle={{ border: "1px solid var(--color-border)", borderRadius: 7, background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 12 }}
                formatter={(value, name) => [value == null ? "Sin dato" : money(Number(value)), name === "meta" ? "Meta" : "Facturado"]}
                labelFormatter={(label) => `${label} ${anio}`}
              />
              <Area type="monotone" dataKey="facturado" stroke="var(--color-chart-1)" strokeWidth={2.5} fill="url(#revenueFill)" connectNulls={false} activeDot={{ r: 4, fill: "var(--color-chart-1)", stroke: "#fff", strokeWidth: 2 }} />
              <Area type="monotone" dataKey="meta" stroke="var(--color-chart-2)" strokeWidth={1.75} strokeDasharray="5 4" fill="none" connectNulls={false} activeDot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <UnitPerformance rows={unitRows} />
      </div>
    </>
  );
}
