import { money, MESES } from "@/lib/format";
import { Goal, TrendingDown, XOctagon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  metaMensual?: number[];
  periodoLabel: string;
  anio: number;
  facturadoVsCotizadoPorcentaje: number;
  cumplimientoMetaPorcentaje: number;
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
  metaMensual,
  periodoLabel,
  anio,
  facturadoVsCotizadoPorcentaje,
  cumplimientoMetaPorcentaje,
  ventasPerdidas,
  ventasPerdidasPorcentaje,
  facturadoProjection,
}: KpiCardsProps) {
  const gap = Math.max(0, metaMes - facturado);
  const reached = metaMes > 0 && cumplimientoMetaPorcentaje >= 100;
  const trend = facturadoMensual ?? [];
  const data = MESES.map((month, index) => ({
    month: month.slice(0, 3),
    facturado: trend[index] ?? 0,
    meta: metaMensual?.[index] ?? 0,
  }));

  return (
    <section className="ccv-revenue-panel" aria-label="Desempeño de facturación">
      <div className="ccv-revenue-main">
        <div className="ccv-revenue-heading">
          <div>
            <p className="ccv-revenue-eyebrow">RESULTADO COMERCIAL · {periodoLabel}</p>
            <h2>Facturado en el período</h2>
          </div>
          <span className={`ccv-revenue-status ${reached ? "is-reached" : ""}`}>
            <span aria-hidden="true" />
            {metaMes <= 0 ? "Sin meta" : reached ? "Meta alcanzada" : "En curso"}
          </span>
        </div>

        <div className="ccv-revenue-value-row">
          <strong>{money(facturado)}</strong>
          <span className="ccv-revenue-attainment">{metaMes > 0 ? <>{cumplimientoMetaPorcentaje.toFixed(1)}% <small>de la meta</small></> : "Sin meta configurada"}</span>
        </div>

        <p className="ccv-revenue-chart-title">Evolución mensual · {anio}</p>
        <div className="ccv-revenue-chart" role="img" aria-label={`Facturación y meta mensual de enero a diciembre de ${anio}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d7950" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2d7950" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e0e9e0" strokeDasharray="3 5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#747c72", fontSize: 11 }} tickMargin={10} />
              <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "#747c72", fontSize: 10 }} tickFormatter={compactMoney} />
              <Tooltip
                cursor={{ stroke: "#aab4a8", strokeDasharray: "3 4" }}
                contentStyle={{ border: "1px solid #dce4dd", borderRadius: 8, background: "#ffffff", fontSize: 12 }}
                formatter={(value, name) => [money(Number(value)), name === "meta" ? "Meta mensual" : "Facturado"]}
                labelFormatter={(label) => `${label} ${anio}`}
              />
              <Area type="monotone" dataKey="facturado" stroke="#2d7950" strokeWidth={2.5} fill="url(#revenueFill)" activeDot={{ r: 5, fill: "#2d7950", stroke: "#ffffff", strokeWidth: 2 }} />
              <Area type="monotone" dataKey="meta" stroke="var(--color-chart-2)" strokeWidth={1.5} strokeDasharray="5 4" fill="none" activeDot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="ccv-revenue-chart-key"><span><i /> Facturación</span><span><i /> Meta mensual</span></div>
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
          <div><span>Total cotizado</span><strong>{money(cotizado)}</strong><small>Facturación: {facturadoVsCotizadoPorcentaje.toFixed(1)}% del cotizado</small></div>
          <div className="ccv-revenue-lost"><span><TrendingDown aria-hidden="true" /> Ventas perdidas</span><strong>{money(ventasPerdidas)}</strong><small><XOctagon aria-hidden="true" /> {ventasPerdidasPorcentaje.toFixed(1)}% de lo cotizado</small></div>
        </div>
      </aside>
    </section>
  );
}
