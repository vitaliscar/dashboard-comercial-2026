"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMercadeoCanalesAction,
  getMercadeoGoogleBusinessAction,
  getMercadeoInstagramAction,
  getMercadeoPostHistoriasAction,
} from "@/lib/actions/mercadeo";
import type { MonthFilter } from "@/lib/date-range";
import { getAllowedMonths } from "@/lib/date-range";
import { sumCantidad, formatMercadeoNumero } from "@/lib/analytics/mercadeo";
import { KpiCard } from "@/components/kpi-card";
import { Globe, Instagram, MapPin, FileImage, Users } from "lucide-react";

interface Props {
  anio: number;
  meses: MonthFilter;
  leadsTotal: number;
}

/**
 * Panorama ejecutivo: 4 números clave del período filtrado antes de entrar al
 * detalle por canal. Reutiliza las mismas queryKeys que las secciones — caché
 * compartido con TanStack Query.
 */
export function MercadeoResumenKpis({ anio, meses, leadsTotal }: Props) {
  const mesesPermitidos = useMemo(() => getAllowedMonths(anio, meses), [anio, meses]);

  const { data: canales } = useQuery({
    queryKey: ["mercadeo-canales"],
    queryFn: () => getMercadeoCanalesAction({ meses: "all" }),
  });
  const { data: instagram } = useQuery({
    queryKey: ["mercadeo-instagram"],
    queryFn: () => getMercadeoInstagramAction({ meses: "all" }),
  });
  const { data: gmb } = useQuery({
    queryKey: ["mercadeo-gmb"],
    queryFn: () => getMercadeoGoogleBusinessAction({ meses: "all" }),
  });
  const { data: posts } = useQuery({
    queryKey: ["mercadeo-post-historias"],
    queryFn: () => getMercadeoPostHistoriasAction({ meses: "all" }),
  });

  const kpis = useMemo(() => {
    const alcanceIg = sumCantidad(
      (instagram ?? []).filter((r) => r.tipo === "Alcance"),
      mesesPermitidos,
    );
    const visitasWeb = sumCantidad(
      (canales ?? []).filter((r) => r.tipo === "Visitas Sitio Web" && r.canal === "Pagina Web"),
      mesesPermitidos,
    );
    const interaccionesGmb = sumCantidad(
      (gmb ?? []).filter((r) => r.tipo === "Interacciones"),
      mesesPermitidos,
    );
    const publicaciones = sumCantidad(posts ?? [], mesesPermitidos);

    return {
      alcanceIg,
      visitasWeb,
      interaccionesGmb,
      publicaciones,
    };
  }, [canales, instagram, gmb, posts, mesesPermitidos]);

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      <KpiCard
        label="Alcance Instagram"
        value={formatMercadeoNumero(kpis.alcanceIg)}
        icon={Instagram}
        accent="primary"
        tooltip="Suma de la métrica Alcance en la hoja Instagram del período"
      />
      <KpiCard
        label="Visitas web"
        value={formatMercadeoNumero(kpis.visitasWeb)}
        icon={Globe}
        accent="ochre"
        tooltip="Visitas al sitio web (canal Página Web) en el período"
      />
      <KpiCard
        label="Interacciones GMB"
        value={formatMercadeoNumero(kpis.interaccionesGmb)}
        icon={MapPin}
        tooltip="Interacciones en Google My Business, todas las sucursales"
      />
      <KpiCard
        label="Publicaciones"
        value={formatMercadeoNumero(kpis.publicaciones)}
        icon={FileImage}
        tooltip="Posts + historias de Instagram en el período"
      />
      <KpiCard
        label="Leads CRM"
        value={String(leadsTotal)}
        icon={Users}
        accent="success"
        tooltip="Clientes potenciales detectados en el período (filtro de fecha)"
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}
