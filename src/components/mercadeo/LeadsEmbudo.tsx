"use client";

import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";

/**
 * Embudo por Estatus BIS. Se reutiliza RankedHorizontalBar (mismo "job":
 * comparar magnitudes entre pocas categorías con etiquetas largas) en vez de
 * introducir un componente de funnel nuevo.
 */
export function LeadsEmbudo({ data }: { data: { estatus: string; cantidad: number }[] }) {
  return (
    <RankedHorizontalBar
      title="Embudo por estatus"
      subtitle="Cantidad de clientes potenciales por Estatus BIS"
      emptyLabel="Sin clientes potenciales para el filtro seleccionado"
      data={data.map((d) => ({ label: d.estatus, value: d.cantidad }))}
      valueFormatter={(v) => v.toLocaleString("es-VE")}
    />
  );
}
