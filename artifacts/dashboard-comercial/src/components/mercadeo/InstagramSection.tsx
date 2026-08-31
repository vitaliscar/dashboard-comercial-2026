"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { getMercadeoInstagramAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { getAllowedMonths } from "@/lib/date-range";
import {
  buildMercadeoStackedSeries,
  formatMercadeoNumero,
  getMercadeoHighlightLabels,
  mesesConDatos,
  ordenarTiposInstagram,
  sumCantidad,
} from "@/lib/analytics/mercadeo";
import { MercadeoStackedBarChart } from "@/components/mercadeo/MercadeoStackedBarChart";

interface Props {
  anio: number;
  meses: MonthFilter;
}

/**
 * Hoja "Instagram": métricas propias de la cuenta (Visualizaciones, Alcance…)
 * apiladas mes a mes. El mes en revisión (filtro) se resalta; el resto opaco.
 */
export function InstagramSection({ anio, meses }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["mercadeo-instagram"],
    queryFn: () => getMercadeoInstagramAction({ meses: "all" }),
  });

  const mesesPermitidos = useMemo(() => getAllowedMonths(anio, meses), [anio, meses]);

  const tipos = useMemo(
    () => ordenarTiposInstagram([...new Set((data ?? []).map((r) => r.tipo))]),
    [data],
  );

  const serie = useMemo(
    () => buildMercadeoStackedSeries(data ?? [], tipos, (r) => r.tipo),
    [data, tipos],
  );

  const mesesEnGrafico = useMemo(() => mesesConDatos(data ?? []), [data]);
  const highlightMonths = useMemo(
    () => getMercadeoHighlightLabels(meses, mesesEnGrafico),
    [meses, mesesEnGrafico],
  );

  const totalAlcance = useMemo(
    () =>
      sumCantidad(
        (data ?? []).filter((r) => r.tipo === "Alcance"),
        mesesPermitidos,
      ),
    [data, mesesPermitidos],
  );

  return (
    <Card className="ring-0 card-elevated min-w-0">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Instagram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoading && tipos.length > 0 && (
          <KpiCard
            label="Total · Alcance"
            value={formatMercadeoNumero(totalAlcance)}
            compact
            featured
            accent="primary"
          />
        )}
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando Instagram…</p>
          ) : (
            <MercadeoStackedBarChart
              data={serie}
              segmentKeys={tipos}
              highlightMonths={highlightMonths}
              emptyLabel="Sin datos de Instagram para el filtro."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
