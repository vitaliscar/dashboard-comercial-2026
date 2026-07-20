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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KpiCard
        label="Total Cotizado"
        value={money(cotizado)}
        icon={ClipboardList}
        accent="primary"
        tooltip="Suma total de cotizaciones creadas en el período seleccionado para todas las unidades de negocio activas."
      />
      <KpiCard
        label="Meta del Mes"
        value={money(metaMes)}
        icon={Goal}
        accent="ochre"
        tooltip="Presupuesto total planificado para el período actual, consolidando todas las sucursales y líneas de negocio."
      />
      <KpiCard
        label="Total Facturado"
        value={money(facturado)}
        icon={TrendingUp}
        accent="success"
        subvalue={`${cumplimientoMetaPorcentaje.toFixed(1)}%`}
        subvalueAlign="inline"
        subvalueClassName={cumplimientoLabelClassName}
        progress={cumplimientoMetaPorcentaje}
        tooltip="Monto facturado en base al módulo de presupuestos consolidando Ventas CCV, Xibi y Estratégicas del mes."
      />
      <KpiCard
        label="Ventas Perdidas"
        value={money(ventasPerdidas)}
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
