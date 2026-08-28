"use client";

import { memo, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { formatMercadeoNumero } from "@/lib/analytics/mercadeo";
import { MERCADEO_COLORES, MercadeoChartTooltip } from "@/components/mercadeo/mercadeo-chart";

const CHART_HEIGHT = 320;

type Props = {
  data: Record<string, string | number>[];
  segmentKeys: string[];
  /** Meses abreviados (ej. "Jul") a resaltar; el resto se muestra al 35% de opacidad. */
  highlightMonths?: string[];
  emptyLabel?: string;
};

/**
 * Barras apiladas mensuales con atenuación de meses fuera del filtro activo.
 * ResponsiveContainer con height fijo en px — evita width/height -1 al montar.
 */
export const MercadeoStackedBarChart = memo(function MercadeoStackedBarChart({
  data,
  segmentKeys,
  highlightMonths = [],
  emptyLabel = "Sin datos para el filtro.",
}: Props) {
  const hasHighlight = highlightMonths.length > 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (segmentKeys.length === 0 || data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  if (!mounted) {
    return <div className="w-full min-w-0" style={{ height: CHART_HEIGHT }} aria-hidden />;
  }

  return (
    <div className="w-full min-w-0" style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
          <Tooltip content={<MercadeoChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {segmentKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="mercadeo"
              fill={MERCADEO_COLORES[i % MERCADEO_COLORES.length]}
              radius={i === segmentKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            >
              {hasHighlight &&
                data.map((row) => (
                  <Cell
                    key={`${key}-${row.mes}`}
                    fill={MERCADEO_COLORES[i % MERCADEO_COLORES.length]}
                    opacity={highlightMonths.includes(String(row.mes)) ? 1 : 0.35}
                  />
                ))}
              <LabelList
                dataKey={key}
                position="center"
                fontSize={9}
                fontWeight={700}
                fill="var(--card)"
                formatter={((v: unknown) => formatMercadeoNumero(Number(v))) as never}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
