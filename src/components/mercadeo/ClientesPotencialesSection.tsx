"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getClientesPotencialesResumenAction,
  type UnidadNegocioLead,
} from "@/lib/actions/mercadeo";
import { LeadsKpis } from "@/components/mercadeo/LeadsKpis";
import { LeadsEmbudo } from "@/components/mercadeo/LeadsEmbudo";

/**
 * Sección agregada de Clientes Potenciales para las páginas de unidad de
 * negocio. Sin tabla de contacto: el action que la alimenta ni siquiera
 * selecciona columnas de PII.
 *
 * `Lubricantes/Filtros` hoy no existe como tipo_negocio en el Excel — esa
 * página mostrará ceros hasta que aparezca la data.
 */
export function ClientesPotencialesSection({ unidad }: { unidad: UnidadNegocioLead }) {
  const { data, isLoading } = useQuery({
    queryKey: ["clientes-potenciales-resumen", unidad],
    queryFn: () => getClientesPotencialesResumenAction({ unidad }),
    enabled: process.env.NODE_ENV !== "production",
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Clientes Potenciales</h2>
        <p className="text-xs text-muted-foreground">
          Leads de {unidad} — origen: CRM (hoja Clientes Potenciales)
        </p>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Cargando clientes potenciales…</p>
      ) : (
        <div className="space-y-3">
          <LeadsKpis resumen={data.resumen} />
          <LeadsEmbudo data={data.embudo} />
        </div>
      )}
    </section>
  );
}
