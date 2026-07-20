import { FacturadoMetrica } from "@/lib/resumen-types";
import { BusinessUnitCard } from "./BusinessUnitCard";
import { DataTable } from "./DataTable";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FacturadoSectionProps {
  datos: FacturadoMetrica[];
  hideSucursalColumn?: boolean;
  /** "summary" = solo header + tarjetas (con filtro de tipo cliente y margen) por unidad;
   * "detail" = solo las tablas de top clientes; omitido = ambos (comportamiento original). */
  part?: "summary" | "detail";
}

type TipoCliente = "TODAS" | "CCV" | "XIB" | "EST";

const TIPO_LABELS: Record<TipoCliente, string> = {
  TODAS: "Todas",
  CCV: "CCV",
  XIB: "Xibi",
  EST: "Est.",
};

function getCumplimientoColor(pct: number): "success" | "warning" | "danger" {
  if (pct >= 100) return "success";
  if (pct >= 80) return "warning";
  return "danger";
}

export function FacturadoSection({
  datos,
  hideSucursalColumn = false,
  part,
}: FacturadoSectionProps) {
  const [tipoClienteFilters, setTipoClienteFilters] = useState<Record<string, TipoCliente>>({});

  if (!datos || datos.length === 0) return null;

  // Skip units with no activity in the selected period to keep the grid clean.
  const datosConActividad = datos.filter((d) => d.monto > 0 || (d.presupuestoTotal ?? 0) > 0);
  if (datosConActividad.length === 0) return null;

  const totalFacturado = datos.reduce((sum, d) => sum + d.monto, 0);
  const showSummary = part !== "detail";
  const showDetail = part !== "summary";
  const compact = part === "summary";
  const gridColsClass = compact
    ? "grid-cols-1"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

  return (
    <div className="mb-8 section-enter section-enter-2">
      {showSummary && (
        <>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
            <h2 className="text-base font-semibold text-foreground">Facturado y Cumplimiento</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              Total: <span className="font-medium text-foreground">{money(totalFacturado)}</span>
            </span>
          </div>

          {/* Business unit cards (con filtro de tipo cliente + margen por unidad) */}
          <div className={cn("grid gap-3", gridColsClass)}>
            {datosConActividad.map((unidad) => {
              const filter = tipoClienteFilters[unidad.unidad] ?? "TODAS";
              const ppto = unidad.presupuestoTotal || 0;

              let displayMonto = unidad.monto;
              let displayCumplimiento = unidad.cumplimiento;

              if (filter === "CCV") {
                displayMonto = unidad.ventasCCV || 0;
                displayCumplimiento = ppto > 0 ? (displayMonto / ppto) * 100 : 0;
              } else if (filter === "XIB") {
                displayMonto = unidad.ventasXibi || 0;
                displayCumplimiento = ppto > 0 ? (displayMonto / ppto) * 100 : 0;
              } else if (filter === "EST") {
                displayMonto = unidad.ventasEstrategicas || 0;
                displayCumplimiento = ppto > 0 ? (displayMonto / ppto) * 100 : 0;
              }

              const cumColor = getCumplimientoColor(displayCumplimiento);

              return (
                <div key={unidad.unidad} className="flex flex-col gap-2">
                  <BusinessUnitCard
                    label={unidad.unidad}
                    monto={displayMonto}
                    porcentaje={unidad.porcentaje}
                    presupuesto={unidad.presupuestoTotal}
                    additionalInfo={[
                      {
                        label: "Cumpl. PPTO",
                        value: `${displayCumplimiento.toFixed(1)}%`,
                        color: cumColor,
                        progress: displayCumplimiento,
                      },
                      {
                        label: "Margen Est.",
                        value: `${unidad.margenEstimado.toFixed(1)}%`,
                        color: "muted",
                      },
                    ]}
                  />

                  {/* Client type filter buttons */}
                  <div className="grid grid-cols-4 gap-1 w-full">
                    {(["TODAS", "CCV", "XIB", "EST"] as TipoCliente[]).map((tipo) => (
                      <Button
                        key={tipo}
                        variant={
                          (tipoClienteFilters[unidad.unidad] ?? "TODAS") === tipo
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="h-6 px-1 text-[10px] truncate"
                        onClick={() =>
                          setTipoClienteFilters({ ...tipoClienteFilters, [unidad.unidad]: tipo })
                        }
                      >
                        {TIPO_LABELS[tipo]}
                      </Button>
                    ))}
                  </div>

                  {/* Margin */}
                  <div className="bg-card rounded-lg border border-border p-3 flex items-center justify-between gap-1">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">Margen Est.</p>
                    <p className="text-xs font-bold text-success tabular-nums">
                      {money(unidad.margenMonto)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showDetail && (
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3",
            showSummary ? "mt-4" : "",
          )}
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
                emptyMessage="Sin facturación"
                maxRows={5}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
