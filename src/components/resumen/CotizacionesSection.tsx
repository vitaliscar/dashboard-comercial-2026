import { UnidadMetrica } from "@/lib/resumen-types";
import { BusinessUnitCard } from "./BusinessUnitCard";
import { CotizacionTimeline } from "./CotizacionTimeline";
import { DataTable } from "./DataTable";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CotizacionesSectionProps {
  datos: UnidadMetrica[];
  hideSucursalColumn?: boolean;
  /** "summary" = solo header + tarjetas por unidad; "detail" = solo tablas de top clientes;
   * omitido = ambos (comportamiento original, para llamadas que no necesitan el layout compacto). */
  part?: "summary" | "detail";
  /** Muestra el % de variación vs. el mes anterior y la línea de tiempo mensual
   * en cada tarjeta (gerente_comercial). */
  showVariacionMesAnterior?: boolean;
  /** Meses (abreviados) a resaltar en la línea de tiempo — el mes que se analiza. */
  highlightMonths?: string[];
}

export function CotizacionesSection({
  datos,
  hideSucursalColumn = false,
  part,
  showVariacionMesAnterior = false,
  highlightMonths = [],
}: CotizacionesSectionProps) {
  if (!datos || datos.length === 0) return null;

  // Skip units with no activity in the selected period to keep the grid clean.
  const datosConActividad = datos.filter((d) => d.monto > 0);
  if (datosConActividad.length === 0) return null;

  const totalCotizado = datos.reduce((sum, d) => sum + d.monto, 0);
  const showSummary = part !== "detail";
  const showDetail = part !== "summary";
  // Una sola tarjeta activa (ej. gerente_comercial con una unidad) → ocupa todo
  // el ancho en vez de quedar confinada a una columna angosta del auto-fit.
  const compact = datosConActividad.length <= 1;

  return (
    <div className={cn("section-enter section-enter-1", part ? "" : "mb-8")}>
      {showSummary && (
        <>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
            <h2 className="text-base font-semibold text-foreground">Cotizaciones</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              Total: <span className="font-medium text-foreground">{money(totalCotizado)}</span>
            </span>
          </div>

          {/* Business unit summary cards — auto-fit (no columnas fijas): con pocas
              unidades activas (ej. un gerente comercial con una sola unidad),
              la tarjeta llena el ancho disponible en vez de quedar confinada a
              1/5 de la fila con espacio vacío a la derecha. */}
          <div
            className={cn("grid gap-3", showDetail ? "mb-6" : "", compact ? "grid-cols-1" : "")}
            style={
              compact ? undefined : { gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }
            }
          >
            {datosConActividad.map((unidad) => {
              const variacion = unidad.variacionMesAnterior;
              const showVariacion = showVariacionMesAnterior && variacion !== undefined;

              const card = (
                <BusinessUnitCard
                  label={unidad.unidad}
                  monto={unidad.monto}
                  porcentaje={unidad.porcentaje}
                  additionalInfo={
                    showVariacion
                      ? [
                          {
                            label: "vs. mes anterior",
                            value:
                              variacion === null
                                ? "N/A"
                                : `${variacion > 0 ? "+" : ""}${variacion.toFixed(1)}%`,
                            color:
                              variacion === null
                                ? "muted"
                                : variacion > 0
                                  ? "success"
                                  : variacion < 0
                                    ? "danger"
                                    : "muted",
                            bidirectionalProgress: variacion === null ? 0 : variacion,
                          },
                          {
                            label: "Monto mes anterior",
                            value: money(unidad.montoMesAnterior ?? 0),
                            color: "muted",
                          },
                        ]
                      : []
                  }
                />
              );

              if (!showVariacion) return <div key={unidad.unidad}>{card}</div>;

              return (
                <div key={unidad.unidad} className="flex flex-col gap-2 h-full">
                  {card}
                  {/* Mismo nivel que la fila de botones de compañías en Facturado */}
                  <div className="h-6 flex items-center justify-center">
                    <p className="text-[10px] font-medium text-muted-foreground tracking-wide">
                      Línea de tiempo de Cotizaciones
                    </p>
                  </div>
                  {/* Mismo nivel y alto que el box "Margen Est." en Facturado */}
                  <CotizacionTimeline
                    data={unidad.montosMensuales ?? []}
                    highlightMonths={highlightMonths}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {showDetail && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
        >
          {datosConActividad.map((unidad) => (
            <div key={`table-${unidad.unidad}`}>
              <p className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">
                Top clientes · {unidad.unidad}
              </p>
              <DataTable
                columns={[
                  ...(hideSucursalColumn
                    ? []
                    : [
                        {
                          key: "sucursal" as const,
                          label: "SUC",
                          format: "abbreviateSucursal" as const,
                          width: "w-[52px]",
                        },
                      ]),
                  { key: "cliente", label: "Cliente", format: "text" as const, tooltip: true },
                  {
                    key: "monto",
                    label: "Monto",
                    format: "currency" as const,
                    width: "w-[85px]",
                    align: "right" as const,
                  },
                ]}
                data={unidad.topClientes}
                showExpandButton={true}
                emptyMessage="Sin cotizaciones"
                maxRows={5}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
