"use client";

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMercadeoCanalesAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { MESES } from "@/lib/format";

/** Paleta compartida por las secciones de Mercadeo (la reusa InstagramSection). */
export const COLORES = [
  "var(--color-chart-calm-1)",
  "var(--color-chart-calm-2)",
  "var(--color-chart-calm-3)",
  "var(--color-chart-calm-4)",
  "var(--color-chart-calm-5)",
  "var(--color-primary)",
  "var(--color-ochre)",
];

/**
 * Comparativa multicanal. La hoja "Canales" mezcla 21 tipos de métrica que no
 * son comparables entre sí (Visitas vs. Impresiones vs. Seguidores), así que
 * el usuario elige un tipo y se grafica la evolución mensual por canal — mismo
 * patrón de selector que el de Cotizado/Facturado/Perdido en Pareto.
 */
export function CanalesSection({ meses }: { meses: MonthFilter }) {
  const { data } = useQuery({
    queryKey: ["mercadeo-canales", JSON.stringify(meses)],
    queryFn: () => getMercadeoCanalesAction({ meses }),
  });

  const tipos = useMemo(
    () => [...new Set((data ?? []).map((r) => r.tipo))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const [tipo, setTipo] = useState<string | null>(null);
  const tipoActivo = tipo ?? tipos[0] ?? null;

  const canales = useMemo(
    () => [...new Set((data ?? []).filter((r) => r.tipo === tipoActivo).map((r) => r.canal))],
    [data, tipoActivo],
  );

  const serie = useMemo(() => {
    const filas = (data ?? []).filter((r) => r.tipo === tipoActivo);
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const punto: Record<string, string | number> = { mes: MESES[i].slice(0, 3) };
      canales.forEach((canal) => {
        punto[canal] = filas
          .filter((r) => r.mes === mes && r.canal === canal)
          .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0);
      });
      return punto;
    });
  }, [data, tipoActivo, canales]);

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-display font-semibold">Canales</CardTitle>
          <p className="text-xs text-muted-foreground">Evolución mensual por canal</p>
        </div>
        <Select value={tipoActivo ?? ""} onValueChange={setTipo}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Tipo de métrica" />
          </SelectTrigger>
          <SelectContent>
            {tipos.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="h-[320px]">
        {canales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de canales para el filtro.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {canales.map((canal, i) => (
                <Line
                  key={canal}
                  type="monotone"
                  dataKey={canal}
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
