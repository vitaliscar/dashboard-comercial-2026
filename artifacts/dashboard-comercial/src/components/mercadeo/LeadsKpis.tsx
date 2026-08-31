"use client";

import { KpiCard } from "@/components/kpi-card";
import { money } from "@/lib/format";
import { Users, UserCheck, Percent, DollarSign, FileText } from "lucide-react";
import type { LeadsResumen } from "@/lib/analytics/clientes-potenciales";

/**
 * KPIs de clientes potenciales. "Monto Facturado" y "Monto en Orden de Venta"
 * NO son el total de la tabla: solo cuentan los leads Convertidos con etapa
 * Cerrado ganado / Propuesta-Negociación respectivamente (ver
 * src/lib/analytics/clientes-potenciales.ts).
 */
export function LeadsKpis({ resumen }: { resumen: LeadsResumen }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Leads totales" value={String(resumen.total)} icon={Users} />
      <KpiCard label="Nuevos" value={String(resumen.nuevos)} icon={FileText} />
      <KpiCard
        label="Convertidos"
        value={String(resumen.convertidos)}
        icon={UserCheck}
        accent="success"
      />
      <KpiCard
        label="Tasa de conversión"
        value={`${resumen.tasaConversion}%`}
        icon={Percent}
        accent="ochre"
      />
      <KpiCard
        label="Monto facturado"
        value={money(resumen.montoFacturado)}
        hint={`En orden de venta: ${money(resumen.montoOrdenVenta)}`}
        icon={DollarSign}
        accent="primary"
      />
    </div>
  );
}
