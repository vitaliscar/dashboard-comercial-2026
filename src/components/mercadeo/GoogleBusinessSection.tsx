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
import { getMercadeoGoogleBusinessAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";

/**
 * Métricas de Google My Business agrupadas por sucursal. El selector de tipo
 * evita mezclar métricas no comparables (mismo patrón que CanalesSection).
 */
export function GoogleBusinessSection({ meses }: { meses: MonthFilter }) {
  const { data } = useQuery({
    queryKey: ["mercadeo-gmb", JSON.stringify(meses)],
    queryFn: () => getMercadeoGoogleBusinessAction({ meses }),
  });

  const tipos = useMemo(
    () => [...new Set((data ?? []).map((r) => r.tipo))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const [tipo, setTipo] = useState<string | null>(null);
  const tipoActivo = tipo ?? tipos[0] ?? null;

  const porSucursal = useMemo(() => {
    const filas = (data ?? []).filter((r) => r.tipo === tipoActivo);
    const grupos = new Map<string, number>();
    filas.forEach((r) => {
      const label = r.sucursal ?? "Sin sucursal";
      grupos.set(label, (grupos.get(label) ?? 0) + Number(r.cantidad ?? 0));
    });
    return [...grupos.entries()].map(([label, value]) => ({ label, value }));
  }, [data, tipoActivo]);

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
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
      </div>
      <RankedHorizontalBar
        title="Google My Business"
        subtitle={`${tipoActivo ?? ""} por sucursal`}
        emptyLabel="Sin datos de Google My Business para el filtro"
        data={porSucursal}
        valueFormatter={(v) => v.toLocaleString("es-VE")}
      />
    </section>
  );
}
