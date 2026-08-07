"use client";

import { useMemo } from "react";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";
import { rankedWithPct } from "@/lib/analytics/mercadeo";
import type { LeadDetalle } from "@/lib/actions/mercadeo";

/**
 * Origen de leads (toma de contacto) — responde "¿de dónde vienen?" sin
 * exponer PII adicional; usa el mismo detalle ya cargado en /mercadeo.
 */
export function LeadsOrigenSection({ rows }: { rows: LeadDetalle[] }) {
  const data = useMemo(() => {
    const grupos = new Map<string, number>();
    rows.forEach((r) => {
      const label = r.tomaContacto?.trim() || "Sin origen";
      grupos.set(label, (grupos.get(label) ?? 0) + 1);
    });
    return rankedWithPct([...grupos.entries()].map(([label, value]) => ({ label, value })));
  }, [rows]);

  return (
    <RankedHorizontalBar
      title="Origen de leads"
      subtitle="Canal de primer contacto (Toma de contacto)"
      emptyLabel="Sin datos de origen para el filtro"
      data={data}
      valueFormatter={(v) => v.toLocaleString("es-VE")}
    />
  );
}
