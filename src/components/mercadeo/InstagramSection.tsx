"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMercadeoInstagramAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { MESES } from "@/lib/format";
import { COLORES } from "@/components/mercadeo/CanalesSection";

/**
 * Detalle mensual de la cuenta de Instagram — una línea por tipo de métrica
 * (Visualizaciones, Alcance, Interacciones, Seguidores, etc.).
 */
export function InstagramSection({ meses }: { meses: MonthFilter }) {
  const { data } = useQuery({
    queryKey: ["mercadeo-instagram", JSON.stringify(meses)],
    queryFn: () => getMercadeoInstagramAction({ meses }),
  });

  const tipos = useMemo(
    () => [...new Set((data ?? []).map((r) => r.tipo))].sort((a, b) => a.localeCompare(b)),
    [data],
  );

  const serie = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const punto: Record<string, string | number> = { mes: MESES[i].slice(0, 3) };
      tipos.forEach((tipo) => {
        punto[tipo] = (data ?? [])
          .filter((r) => r.mes === mes && r.tipo === tipo)
          .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0);
      });
      return punto;
    });
  }, [data, tipos]);

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader>
        <CardTitle className="font-display font-semibold">Instagram</CardTitle>
        <p className="text-xs text-muted-foreground">Detalle mensual de la cuenta</p>
      </CardHeader>
      <CardContent className="h-[320px]">
        {tipos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de Instagram para el filtro.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {tipos.map((tipo, i) => (
                <Line
                  key={tipo}
                  type="monotone"
                  dataKey={tipo}
                  stroke={COLORES[i % COLORES.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
