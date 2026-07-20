import { UnidadMetrica } from "@/lib/resumen-types";
import { BusinessUnitCard } from "./BusinessUnitCard";
import { DataTable } from "./DataTable";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CotizacionesSectionProps {
  datos: UnidadMetrica[];
  hideSucursalColumn?: boolean;
  /** "summary" = solo header + tarjetas por unidad; "detail" = solo tablas de top clientes;
   * omitido = ambos (comportamiento original, para llamadas que no necesitan el layout compacto). */
  part?: "summary" | "detail";
}

export function CotizacionesSection({
  datos,
  hideSucursalColumn = false,
  part,
}: CotizacionesSectionProps) {
  if (!datos || datos.length === 0) return null;

  // Skip units with no activity in the selected period to keep the grid clean.
  const datosConActividad = datos.filter((d) => d.monto > 0);
  if (datosConActividad.length === 0) return null;

  const totalCotizado = datos.reduce((sum, d) => sum + d.monto, 0);
  const showSummary = part !== "detail";
  const showDetail = part !== "summary";
  const compact = part === "summary";

  return (
    <div className="mb-8 section-enter section-enter-1">
      {showSummary && (
        <>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
            <h2 className="text-base font-semibold text-foreground">Cotizaciones</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              Total: <span className="font-medium text-foreground">{money(totalCotizado)}</span>
            </span>
          </div>

          {/* Business unit summary cards */}
          <div
            className={cn(
              "grid gap-3",
              showDetail ? "mb-6" : "",
              compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
            )}
          >
            {datosConActividad.map((unidad) => (
              <BusinessUnitCard
                key={unidad.unidad}
                label={unidad.unidad}
                monto={unidad.monto}
                porcentaje={unidad.porcentaje}
              />
            ))}
          </div>
        </>
      )}

      {showDetail && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
                          width: "w-[40px]",
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
