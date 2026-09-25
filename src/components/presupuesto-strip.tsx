"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPresupuestoStripAction } from "@/lib/actions/gerencia-nacional";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { getAllowedMonths } from "@/lib/date-range";
import { money, pct, statusFromPct } from "@/lib/format";
import { agruparPresupuestoPorUnidad, type PresupuestoUnidad } from "@/lib/presupuesto-strip";
import { cn } from "@/lib/utils";

const ROLES_CON_FRANJA = ["administrador", "gerencia", "gerente_comercial", "coordinador"];

const STATUS_TEXT = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

const EYEBROW = "text-[10px] font-display font-bold tracking-wide uppercase text-muted-foreground";

function Celda({
  label,
  meta,
  facturado,
  pctValue,
  total,
}: {
  label: string;
  meta: number;
  facturado: number;
  pctValue: number;
  total?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-col gap-1 px-4 py-3", total && "bg-primary/5 border-l border-border")}
    >
      <div className={EYEBROW}>{label}</div>
      <div>
        <div
          className={cn("font-display font-semibold tabular-nums", total ? "text-xl" : "text-lg")}
        >
          {money(meta)}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          Ejecutado {money(facturado)} ·{" "}
          <span className={cn("font-semibold", STATUS_TEXT[statusFromPct(pctValue)])}>
            {pct(pctValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FranjaUnidad({ u }: { u: PresupuestoUnidad }) {
  const faltante = Math.max(0, u.meta - u.facturado);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
      <div className="px-4 py-3">
        <div className={EYEBROW}>Presupuesto · {u.label}</div>
        <div className="font-display text-xl font-semibold tabular-nums">{money(u.meta)}</div>
      </div>
      <div className="px-4 py-3">
        <div className={EYEBROW}>Ejecutado</div>
        <div className="font-display text-xl font-semibold tabular-nums">{money(u.facturado)}</div>
      </div>
      <div className="px-4 py-3">
        <div className={EYEBROW}>Cumplimiento</div>
        <div
          className={cn(
            "font-display text-xl font-semibold tabular-nums",
            STATUS_TEXT[statusFromPct(u.pct)],
          )}
        >
          {pct(u.pct)}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {faltante > 0 ? `Faltan ${money(faltante)}` : "Meta alcanzada"}
        </div>
      </div>
    </div>
  );
}

/**
 * Presupuesto por unidad de negocio + total, justo bajo los filtros. Lee los filtros
 * compartidos (año, mes, sucursal) y se ordena solo; RLS limita las filas a lo que el rol
 * puede ver (coordinador = su sucursal, gerente comercial = sus unidades).
 */
export function PresupuestoStrip() {
  const { role, profile } = useAuth();
  const { filters } = useSharedFilters();
  const { anio, meses, sucursales: sucursalIds = [] } = filters;
  const enabled = !!role && ROLES_CON_FRANJA.includes(role);

  const { data: unidades } = useUnidades();
  const { data: sucursalesData } = useSucursales();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["presupuesto-strip", anio, profile?.id],
    enabled,
    queryFn: () => getPresupuestoStripAction({ anio }),
  });

  const resumen = useMemo(() => {
    if (!rows || !unidades) return null;
    return agruparPresupuestoPorUnidad(
      rows,
      { meses: getAllowedMonths(anio, meses), sucursalIds },
      unidades,
    );
  }, [rows, unidades, anio, meses, sucursalIds]);

  const contexto = useMemo(() => {
    if (role !== "coordinador" || !sucursalesData) return null;
    const ids = profile?.sucursales_ids?.length
      ? profile.sucursales_ids
      : profile?.sucursal_id
        ? [profile.sucursal_id]
        : [];
    return sucursalesData
      .filter((s) => ids.includes(s.id))
      .map((s) => s.nombre)
      .join(", ");
  }, [role, sucursalesData, profile]);

  if (!enabled) return null;
  if (isLoading || !resumen) {
    return <div className="card-elevated h-[92px] animate-pulse" aria-hidden />;
  }
  if (resumen.unidades.length === 0) {
    return (
      <div className="card-elevated px-4 py-3 text-sm text-muted-foreground">
        Sin presupuesto para el período seleccionado.
      </div>
    );
  }

  const titulo = contexto ? `Presupuesto · ${contexto}` : "Presupuesto por unidad de negocio";

  return (
    <section aria-label={titulo} className="card-elevated overflow-hidden section-enter">
      <div className={cn(EYEBROW, "px-4 pt-3")}>{titulo}</div>
      {resumen.unidades.length === 1 ? (
        <FranjaUnidad u={resumen.unidades[0]} />
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${resumen.unidades.length + 1}, minmax(9.5rem, 1fr))`,
            }}
          >
            {resumen.unidades.map((u) => (
              <Celda
                key={u.id}
                label={u.label}
                meta={u.meta}
                facturado={u.facturado}
                pctValue={u.pct}
              />
            ))}
            <Celda
              label="Total"
              meta={resumen.total.meta}
              facturado={resumen.total.facturado}
              pctValue={resumen.total.pct}
              total
            />
          </div>
        </div>
      )}
    </section>
  );
}
