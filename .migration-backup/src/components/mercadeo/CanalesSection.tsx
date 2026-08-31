"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiCard } from "@/components/kpi-card";
import { getMercadeoCanalesAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { getAllowedMonths } from "@/lib/date-range";
import {
  buildMercadeoStackedSeries,
  esCanalHojaCanales,
  formatMercadeoNumero,
  getMercadeoHighlightLabels,
  mesesConDatos,
  ordenarCanales,
  sumCantidad,
} from "@/lib/analytics/mercadeo";
import { MERCADEO_COLORES } from "@/components/mercadeo/mercadeo-chart";
import { MercadeoStackedBarChart } from "@/components/mercadeo/MercadeoStackedBarChart";

/** @deprecated Usar MERCADEO_COLORES desde mercadeo-chart.tsx */
export const COLORES = MERCADEO_COLORES;

const TODOS_LOS_CANALES = "Todos";

interface Props {
  anio: number;
  meses: MonthFilter;
}

/**
 * Hoja "Canales": col. A = canal, B = tipo de métrica, C = mes, D = cantidad.
 * Instagram se excluye aquí — tiene hoja y card propios.
 */
export function CanalesSection({ anio, meses }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["mercadeo-canales"],
    queryFn: () => getMercadeoCanalesAction({ meses: "all" }),
  });

  const mesesPermitidos = useMemo(() => getAllowedMonths(anio, meses), [anio, meses]);

  const filasCanales = useMemo(
    () => (data ?? []).filter((r) => esCanalHojaCanales(r.canal)),
    [data],
  );

  const canalesDisponibles = useMemo(
    () => ordenarCanales([...new Set(filasCanales.map((r) => r.canal))]),
    [filasCanales],
  );

  const [canal, setCanal] = useState<string>(TODOS_LOS_CANALES);

  const filasCanal = useMemo(
    () =>
      canal === TODOS_LOS_CANALES ? filasCanales : filasCanales.filter((r) => r.canal === canal),
    [filasCanales, canal],
  );

  const tipos = useMemo(
    () => [...new Set(filasCanal.map((r) => r.tipo))].sort((a, b) => a.localeCompare(b)),
    [filasCanal],
  );

  const serie = useMemo(
    () => buildMercadeoStackedSeries(filasCanal, tipos, (r) => r.tipo),
    [filasCanal, tipos],
  );

  const mesesEnGrafico = useMemo(() => mesesConDatos(filasCanal), [filasCanal]);
  const highlightMonths = useMemo(
    () => getMercadeoHighlightLabels(meses, mesesEnGrafico),
    [meses, mesesEnGrafico],
  );

  const totalPeriodo = useMemo(
    () => sumCantidad(filasCanal, mesesPermitidos),
    [filasCanal, mesesPermitidos],
  );

  const etiquetaCanal = canal === TODOS_LOS_CANALES ? "Todos los canales" : canal;

  return (
    <Card className="ring-0 card-elevated min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="font-display font-semibold">Canales digitales</CardTitle>
        <Select value={canal} onValueChange={(v) => setCanal(v ?? TODOS_LOS_CANALES)}>
          <SelectTrigger className="w-65">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_LOS_CANALES}>Todos</SelectItem>
            {canalesDisponibles.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoading && tipos.length > 0 && (
          <KpiCard
            label={`Total · ${etiquetaCanal}`}
            value={formatMercadeoNumero(totalPeriodo)}
            compact
            featured
            accent="primary"
          />
        )}
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando canales…</p>
          ) : (
            <MercadeoStackedBarChart
              data={serie}
              segmentKeys={tipos}
              highlightMonths={highlightMonths}
              emptyLabel="Sin datos de canales para el filtro."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
