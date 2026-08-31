import { VentasPerdidaMetrica } from "@/lib/resumen-types";
import { BusinessUnitCard } from "./BusinessUnitCard";
import { DataTable } from "./DataTable";
import { money } from "@/lib/format";

interface VentasPerdidasSectionProps {
  datos: VentasPerdidaMetrica[];
  hideSucursalColumn?: boolean;
  /** Muestra el % de variación vs. el mes anterior y el monto del mes anterior
   * en cada tarjeta (gerente_comercial) — mismo patrón que Cotizaciones. */
  showVariacionMesAnterior?: boolean;
}

export function VentasPerdidasSection({
  datos,
  hideSucursalColumn = false,
  showVariacionMesAnterior = false,
}: VentasPerdidasSectionProps) {
  if (!datos || datos.length === 0) return null;

  // Skip units with no activity in the selected period to keep the grid clean.
  const datosConActividad = datos.filter((d) => d.monto > 0);
  if (datosConActividad.length === 0) return null;

  const totalPerdido = datos.reduce((sum, u) => sum + u.monto, 0);

  const topClientes = datos
    .flatMap((u) => u.topClientes.map((c) => ({ ...c, unidad: u.unidad })))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  const topRazones = datos
    .flatMap((u) => u.topRazones)
    .reduce(
      (acc, r) => {
        const existing = acc.find((item) => item.razon === r.razon);
        if (existing) {
          existing.monto += r.monto;
          existing.cantidad += r.cantidad;
        } else {
          acc.push({ ...r });
        }
        return acc;
      },
      [] as { razon: string; monto: number; cantidad: number }[],
    )
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5);

  return (
    <div className="mb-8 section-enter section-enter-3">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
        <h2 className="text-base font-semibold text-foreground">Ventas perdidas</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          Total: <span className="font-medium text-danger">{money(totalPerdido)}</span>
        </span>
      </div>

      {/* 3 columnas en la misma fila: monto por unidad, top clientes, top razones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">
            Monto Ventas Perdidas
          </p>
          <div className="flex flex-col gap-3">
            {datosConActividad.map((unidad) => {
              const variacion = unidad.variacionMesAnterior;
              const showVariacion = showVariacionMesAnterior && variacion !== undefined;

              return (
                <BusinessUnitCard
                  key={unidad.unidad}
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
                            // Invertido respecto a Cotizaciones: en ventas perdidas, subir es malo.
                            color:
                              variacion === null
                                ? "muted"
                                : variacion > 0
                                  ? "danger"
                                  : variacion < 0
                                    ? "success"
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
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">
            Top 5 clientes
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
            data={topClientes}
            showExpandButton={false}
            emptyMessage="Sin ventas perdidas"
            maxRows={5}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 tracking-wide">
            Top 5 razones
          </p>
          <DataTable
            columns={[
              { key: "razon", label: "Razón", format: "text" },
              {
                key: "monto",
                label: "Monto",
                format: "currency",
                width: "w-[85px]",
                align: "right",
              },
              {
                key: "cantidad",
                label: "#",
                format: "text",
                width: "w-[40px]",
                align: "right",
              },
            ]}
            data={topRazones}
            showExpandButton={false}
            emptyMessage="Sin razones registradas"
            maxRows={5}
          />
        </div>
      </div>
    </div>
  );
}
