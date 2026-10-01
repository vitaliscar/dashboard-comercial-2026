import { money, MESES } from "@/lib/format";
import { Goal, TrendingDown, TrendingUp, XOctagon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface KpiCardsProps {
  cotizado: number;
  metaMes: number;
  facturado: number;
  facturadoMensual?: number[];
  anio: number;
  facturadoVsCotizadoPorcentaje: number;
  cumplimientoMetaPorcentaje: number;
  margenTotal: number;
  margenPorcentaje: number;
  ventasPerdidas: number;
  ventasPerdidasPorcentaje: number;
  facturadoProjection?: { value: string; tone: "success" | "warning" | "danger" };
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
  anio,
  facturadoVsCotizadoPorcentaje,
  cumplimientoMetaPorcentaje,
  ventasPerdidas,
  ventasPerdidasPorcentaje,
  facturadoProjection,
}: KpiCardsProps) {
  const gap = Math.max(0, metaMes - facturado);
  const reached = cumplimientoMetaPorcentaje >= 100;
  const trend = facturadoMensual ?? [];
  const data = MESES.map((month, index) => ({
    month: month.slice(0, 3),
    facturado: trend[index] ?? 0,
  }));

  return (
    <section className="ccv-revenue-panel" aria-label="Desempeño de facturación">
      <div className="ccv-revenue-main">
        <div className="ccv-revenue-heading">
          <div>
            <p className="ccv-revenue-eyebrow">RITMO DE FACTURACIÓN · {anio}</p>
            <h2>Facturado del período</h2>
          </div>
          <span className={`ccv-revenue-status ${reached ? "is-reached" : ""}`}>
            <span aria-hidden="true" />
            {reached ? "Meta alcanzada" : "En curso"}
          </span>
        </div>

        <div className="ccv-revenue-value-row">
          <strong>{money(facturado)}</strong>
          <span className="ccv-revenue-attainment">{cumplimientoMetaPorcentaje.toFixed(1)}% <small>de la meta</small></span>
        </div>

        <div className="ccv-revenue-chart" role="img" aria-label={`Facturación mensual de enero a diciembre de ${anio}; meta del período ${money(metaMes)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b36e2d" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#b36e2d" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e8e4d8" strokeDasharray="3 5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#747c72", fontSize: 11 }} tickMargin={10} />
              <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "#747c72", fontSize: 10 }} tickFormatter={compactMoney} />
              {metaMes > 0 && <ReferenceLine y={metaMes} stroke="#7b8b7d" strokeDasharray="5 5" />}
              <Tooltip
                cursor={{ stroke: "#aab4a8", strokeDasharray: "3 4" }}
                contentStyle={{ border: "1px solid #d9d7cd", borderRadius: 6, background: "#fffef9", fontSize: 12 }}
                formatter={(value) => [money(Number(value)), "Facturado"]}
                labelFormatter={(label) => `${label} ${anio}`}
              />
              <Area type="monotone" dataKey="facturado" stroke="#a65e25" strokeWidth={2.5} fill="url(#revenueFill)" activeDot={{ r: 5, fill: "#a65e25", stroke: "#fffef9", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="ccv-revenue-chart-key"><span><i /> Facturación mensual</span><span><i /> Meta del período</span></div>
      </div>

      <aside className="ccv-revenue-aside" aria-label="Indicadores del período">
        <div className="ccv-revenue-target">
          <div><Goal aria-hidden="true" /><span>Meta del período</span></div>
          <strong>{money(metaMes)}</strong>
          <p>{reached ? `Superada por ${money(facturado - metaMes)}` : `Faltan ${money(gap)} para alcanzarla`}</p>
          <div className="ccv-revenue-progress" role="progressbar" aria-label="Cumplimiento de meta" aria-valuenow={Math.round(cumplimientoMetaPorcentaje)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.min(cumplimientoMetaPorcentaje, 100)}%` }} />
          </div>
          {facturadoProjection && <small className={`ccv-revenue-projection tone-${facturadoProjection.tone}`}>Proyección cierre <b>{facturadoProjection.value}</b></small>}
        </div>
        <div className="ccv-revenue-secondary">
          <div><span>Total cotizado</span><strong>{money(cotizado)}</strong><small>{facturadoVsCotizadoPorcentaje.toFixed(1)}% convertido en facturación</small></div>
          <div className="ccv-revenue-lost"><span><TrendingDown aria-hidden="true" /> Ventas perdidas</span><strong>{money(ventasPerdidas)}</strong><small><XOctagon aria-hidden="true" /> {ventasPerdidasPorcentaje.toFixed(1)}% de lo cotizado</small></div>
        </div>
        <div className="ccv-revenue-note"><TrendingUp aria-hidden="true" /><span>La línea muestra la venta registrada por mes. La referencia punteada marca la meta del período.</span></div>
      </aside>
    </section>
  );
}
