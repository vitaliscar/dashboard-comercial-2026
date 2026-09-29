import { money } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { ClipboardList, Goal, TrendingUp, XOctagon } from "lucide-react";

interface KpiCardsProps {
  cotizado: number;
  metaMes: number;
  facturado: number;
  facturadoVsCotizadoPorcentaje: number;
  cumplimientoMetaPorcentaje: number;
  margenTotal: number;
  margenPorcentaje: number;
  ventasPerdidas: number;
  ventasPerdidasPorcentaje: number;
  facturadoProjection?: {
    value: string;
    tone: "success" | "warning" | "danger";
  };
}

export function KpiCards({
  cotizado,
  metaMes,
  facturado,
  facturadoVsCotizadoPorcentaje,
  cumplimientoMetaPorcentaje,
  margenTotal,
  margenPorcentaje,
  ventasPerdidas,
  ventasPerdidasPorcentaje,
  facturadoProjection,
}: KpiCardsProps) {
  const cumplimientoTone =
    cumplimientoMetaPorcentaje < 70
      ? "danger"
      : cumplimientoMetaPorcentaje < 90
        ? "warning"
        : "success";
  const diferenciaMeta = metaMes - facturado;
  const insightLabel =
    diferenciaMeta > 0
      ? `Restan ${money(diferenciaMeta)} para alcanzar la meta.`
      : `Meta superada por ${money(Math.abs(diferenciaMeta))}.`;
  const statusLabel =
    cumplimientoMetaPorcentaje >= 100
      ? "Meta superada"
      : cumplimientoTone === "success"
        ? "Cerca de la meta"
        : cumplimientoTone === "warning"
          ? "En seguimiento"
          : "Requiere atención";

  return (
    <div className="ccv-kpi-overview">
      <KpiCard
        featured
        className="ccv-kpi-hero"
        label="Facturado del período"
        value={money(facturado)}
        icon={TrendingUp}
        accent="success"
        subvalue={`${cumplimientoMetaPorcentaje.toFixed(1)}%`}
        subvalueLabel="de la meta"
        subvalueAlign="inline"
        subvalueClassName="ccv-kpi-hero-percent"
        projection={facturadoProjection}
        tooltip="Monto facturado en el período seleccionado, consolidando Ventas CCV, Xibi y Estratégicas."
      />

      <section className="ccv-kpi-insights" aria-label="Indicadores comerciales del período">
        <div className="ccv-kpi-insights-heading">
          <div>
            <p>DESEMPEÑO COMERCIAL</p>
            <h2>Este período</h2>
          </div>
          <span className={`ccv-kpi-status ccv-kpi-status-${cumplimientoTone}`}>
            <span aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        <div className="ccv-kpi-metrics">
          <div className="ccv-kpi-metric">
            <span><Goal aria-hidden="true" /> Meta del período</span>
            <strong>{money(metaMes)}</strong>
          </div>
          <div className="ccv-kpi-metric">
            <span><ClipboardList aria-hidden="true" /> Total cotizado</span>
            <strong>{money(cotizado)}</strong>
          </div>
          <div className="ccv-kpi-metric ccv-kpi-metric-lost">
            <span><XOctagon aria-hidden="true" /> Ventas perdidas</span>
            <strong>{money(ventasPerdidas)}</strong>
            <small>{ventasPerdidasPorcentaje.toFixed(1)}% de lo cotizado</small>
          </div>
        </div>

        <div className="ccv-kpi-insight-note">
          <TrendingUp aria-hidden="true" />
          <span>
            {insightLabel} Facturado representa {facturadoVsCotizadoPorcentaje.toFixed(1)}% del
            monto cotizado en el mismo período.
          </span>
        </div>
      </section>
    </div>
  );
}
