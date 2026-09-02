import { money } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { ClipboardList, Goal, TrendingUp, XOctagon } from "lucide-react";

interface KpiCardsProps {
  cotizado: number;
  cotizadoMensual?: number[];
  metaMes: number;
  metaMensual?: number[];
  facturado: number;
  facturadoMensual?: number[];
  facturadoVsCotizadoPorcentaje: number;
  cumplimientoMetaPorcentaje: number;
  margenTotal: number;
  margenPorcentaje: number;
  ventasPerdidas: number;
  ventasPerdidasMensual?: number[];
  ventasPerdidasPorcentaje: number;
  facturadoProjection?: {
    value: string;
    tone: "success" | "warning" | "danger";
  };
}

export function KpiCards({
  cotizado,
  cotizadoMensual,
  metaMes,
  metaMensual,
  facturado,
  facturadoMensual,
  facturadoVsCotizadoPorcentaje,
  cumplimientoMetaPorcentaje,
  margenTotal,
  margenPorcentaje,
  ventasPerdidas,
  ventasPerdidasMensual,
  ventasPerdidasPorcentaje,
  facturadoProjection,
}: KpiCardsProps) {
  const cumplimientoTone =
    cumplimientoMetaPorcentaje < 70
      ? "danger"
      : cumplimientoMetaPorcentaje < 90
        ? "warning"
        : "success";

  const cumplimientoLabelClassName =
    cumplimientoTone === "danger"
      ? "text-danger"
      : cumplimientoTone === "warning"
        ? "text-warning"
        : "text-success";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      <KpiCard
        label="Total Cotizado"
        value={money(cotizado)}
        sparklineData={cotizadoMensual}
        icon={ClipboardList}
        accent="primary"
        tooltip="Suma total de cotizaciones creadas en el período seleccionado para todas las unidades de negocio activas."
      />
      <KpiCard
        label="Meta del Mes"
        value={money(metaMes)}
        sparklineData={metaMensual}
        icon={Goal}
        accent="ochre"
        tooltip="Presupuesto total planificado para el período actual, consolidando todas las sucursales y líneas de negocio."
      />
      <KpiCard
        featured
        label="Total Facturado"
        value={money(facturado)}
        sparklineData={facturadoMensual}
        icon={TrendingUp}
        accent="success"
        subvalue={`${cumplimientoMetaPorcentaje.toFixed(1)}%`}
        subvalueAlign="inline"
        subvalueClassName={cumplimientoLabelClassName}
        progress={cumplimientoMetaPorcentaje}
        projection={facturadoProjection}
        tooltip="Monto facturado en base al módulo de presupuestos consolidando Ventas CCV, Xibi y Estratégicas del mes."
      />
      <KpiCard
        label="Ventas Perdidas"
        value={money(ventasPerdidas)}
        sparklineData={ventasPerdidasMensual}
        icon={XOctagon}
        accent="danger"
        subvalue={`${ventasPerdidasPorcentaje.toFixed(1)}%`}
        subvalueAlign="inline"
        subvalueClassName="text-danger"
        progress={ventasPerdidasPorcentaje}
        tooltip="Monto total cotizado que fue cerrado como oportunidad perdida o rechazada por el cliente durante este período."
      />
    </div>
  );
}
