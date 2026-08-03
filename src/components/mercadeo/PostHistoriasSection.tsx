"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMercadeoPostHistoriasAction } from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { KpiCard } from "@/components/kpi-card";
import { RankedHorizontalBar } from "@/components/servicios/RankedHorizontalBar";

/**
 * Conteo de posts e historias de Instagram, desglosado por marca y por
 * categoría de contenido (unidadNegocio incluye branding, RRHH, eventos…).
 */
export function PostHistoriasSection({ meses }: { meses: MonthFilter }) {
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
    const grupos = new Map<string, number>();
    (data ?? []).forEach((r) => {
      const label = r.marca ?? "Sin marca";
      grupos.set(label, (grupos.get(label) ?? 0) + Number(r.cantidad ?? 0));
    });
    return [...grupos.entries()].map(([label, value]) => ({ label, value }));
  }, [data]);

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, number>();
    (data ?? []).forEach((r) => {
      const label = r.unidadNegocio ?? "Sin categoría";
      grupos.set(label, (grupos.get(label) ?? 0) + Number(r.cantidad ?? 0));
    });
    return [...grupos.entries()].map(([label, value]) => ({ label, value }));
  }, [data]);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Posts"
          value={totalPosts.toLocaleString("es-VE")}
          featured
          accent="primary"
        />
        <KpiCard
          label="Historias"
          value={totalHistorias.toLocaleString("es-VE")}
          featured
          accent="primary"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankedHorizontalBar
          title="Publicaciones por marca"
          emptyLabel="Sin datos de publicaciones para el filtro"
          data={porMarca}
          valueFormatter={(v) => v.toLocaleString("es-VE")}
        />
        <RankedHorizontalBar
          title="Publicaciones por categoría"
          subtitle="Incluye categorías de contenido que no son unidades de negocio (Branding, RRHH, Eventos…)"
          emptyLabel="Sin datos de publicaciones para el filtro"
          data={porCategoria}
          valueFormatter={(v) => v.toLocaleString("es-VE")}
        />
      </div>
    </section>
  );
}
