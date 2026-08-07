"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { getMercadeoGoogleBusinessAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { formatMercadeoNumero, groupSum, rankedWithPct } from "@/lib/analytics/mercadeo";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";

interface Props {
  meses: MonthFilter;
}

/**
 * Métricas de Google My Business agrupadas por sucursal con total del período.
 */
export function GoogleBusinessSection({ meses }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["mercadeo-gmb", JSON.stringify(meses)],
    queryFn: () => getMercadeoGoogleBusinessAction({ meses }),
  });

  const tipos = useMemo(
    () => [...new Set((data ?? []).map((r) => r.tipo))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const [tipo, setTipo] = useState<string | null>(null);
  const tipoActivo = tipo ?? tipos[0] ?? null;

  const filasTipo = useMemo(
    () => (data ?? []).filter((r) => r.tipo === tipoActivo),
    [data, tipoActivo],
  );

  const porSucursal = useMemo(() => {
    const raw = groupSum(
      filasTipo,
      (r) => r.sucursal ?? "Sin sucursal",
      (r) => Number(r.cantidad ?? 0),
    );
    return rankedWithPct(raw);
  }, [filasTipo]);

  const totalPeriodo = useMemo(
    () => filasTipo.reduce((s, r) => s + Number(r.cantidad ?? 0), 0),
    [filasTipo],
  );

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-display font-semibold">Google My Business</CardTitle>
          <p className="text-xs text-muted-foreground">Desglose por sucursal</p>
        </div>
        <Select value={tipoActivo ?? ""} onValueChange={setTipo}>
          <SelectTrigger className="w-65">
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
      <CardContent className="space-y-3">
        {tipoActivo && !isLoading && (
          <KpiCard
            label={`Total · ${tipoActivo}`}
            value={formatMercadeoNumero(totalPeriodo)}
            compact
            featured
            accent="primary"
          />
        )}
        <RankedHorizontalBar
          title={tipoActivo ?? "Google My Business"}
          subtitle="Participación % en el total del período"
          emptyLabel="Sin datos de Google My Business para el filtro"
          data={porSucursal}
          valueFormatter={(v) => v.toLocaleString("es-VE")}
        />
      </CardContent>
    </Card>
  );
}
