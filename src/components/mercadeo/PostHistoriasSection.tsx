"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMercadeoPostHistoriasAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { KpiCard } from "@/components/kpi-card";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";
import { groupSum, rankedWithPct } from "@/lib/analytics/mercadeo";

interface Props {
  meses: MonthFilter;
}

/**
 * Conteo de posts e historias, desglosado por marca y categoría de contenido.
 */
export function PostHistoriasSection({ meses }: Props) {
  const { data } = useQuery({
    queryKey: ["mercadeo-post-historias", JSON.stringify(meses)],
    queryFn: () => getMercadeoPostHistoriasAction({ meses }),
  });

  const totalPosts = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.tipoPublicacion === "Post")
        .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0),
    [data],
  );

  const totalHistorias = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.tipoPublicacion === "Historia")
        .reduce((sum, r) => sum + Number(r.cantidad ?? 0), 0),
    [data],
  );

  const porMarca = useMemo(() => {
    const raw = groupSum(
      data ?? [],
      (r) => r.marca ?? "Sin marca",
      (r) => Number(r.cantidad ?? 0),
    );
    return rankedWithPct(raw);
  }, [data]);

  const porCategoria = useMemo(() => {
    const raw = groupSum(
      data ?? [],
      (r) => r.unidadNegocio ?? "Sin categoría",
      (r) => Number(r.cantidad ?? 0),
    );
    return rankedWithPct(raw);
  }, [data]);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">Contenido en Instagram</h3>
        <p className="text-xs text-muted-foreground">Posts e historias publicadas en el período</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Posts"
          value={totalPosts.toLocaleString("es-VE")}
          featured
          accent="primary"
          tooltip="Publicaciones tipo Post"
        />
        <KpiCard
          label="Historias"
          value={totalHistorias.toLocaleString("es-VE")}
          featured
          accent="ochre"
          tooltip="Publicaciones tipo Historia"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankedHorizontalBar
          title="Por marca"
          emptyLabel="Sin datos de publicaciones para el filtro"
          data={porMarca}
          valueFormatter={(v) => v.toLocaleString("es-VE")}
        />
        <RankedHorizontalBar
          title="Por categoría"
          subtitle="Incluye branding, RRHH, eventos… (no siempre son unidades de negocio)"
          emptyLabel="Sin datos de publicaciones para el filtro"
          data={porCategoria}
          valueFormatter={(v) => v.toLocaleString("es-VE")}
        />
      </div>
    </section>
  );
}
