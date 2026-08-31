"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeEmbudoConPct } from "@/lib/analytics/mercadeo";
import { cn } from "@/lib/utils";

const ESTATUS_COLOR: Record<string, string> = {
  Nuevo: "bg-chart-calm-1",
  Asignado: "bg-chart-calm-2",
  "En proceso": "bg-chart-calm-3",
  Convertidos: "bg-success",
  "Cerrado perdido": "bg-danger",
  "Cerrado sin negocio": "bg-muted-foreground",
  Desconocido: "bg-muted",
};

/**
 * Embudo visual por Estatus BIS con ancho proporcional y tasas de conversión
 * entre etapas — más legible que un ranking horizontal para datos secuenciales.
 */
export function LeadsEmbudo({ data }: { data: { estatus: string; cantidad: number }[] }) {
  const etapas = useMemo(() => computeEmbudoConPct(data), [data]);
  const maxCantidad = Math.max(...etapas.map((e) => e.cantidad), 1);

  if (etapas.length === 0) {
    return (
      <Card className="ring-0 card-elevated">
        <CardHeader>
          <CardTitle className="font-display font-semibold">Embudo por estatus</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sin clientes potenciales para el filtro seleccionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Embudo por estatus</CardTitle>
        <p className="text-xs text-muted-foreground">
          Volumen y % del total · flecha = conversión desde la etapa anterior
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {etapas.map((etapa) => (
          <div key={etapa.estatus} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{etapa.estatus}</span>
              <span className="tabular-nums text-muted-foreground">
                {etapa.cantidad.toLocaleString("es-VE")}
                <span className="ml-1.5 text-foreground/70">({etapa.pctTotal}%)</span>
                {etapa.pctEtapaAnterior !== null && (
                  <span className="ml-1.5 text-primary">← {etapa.pctEtapaAnterior}%</span>
                )}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-muted/50">
              <div
                className={cn(
                  "h-full rounded-sm transition-all duration-500",
                  ESTATUS_COLOR[etapa.estatus] ?? "bg-primary",
                )}
                style={{ width: `${(etapa.cantidad / maxCantidad) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
