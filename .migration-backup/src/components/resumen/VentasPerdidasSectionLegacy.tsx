import { VentasPerdidaMetrica } from "@/lib/resumen-types";
import { BusinessUnitCard } from "./BusinessUnitCard";
import { DataTable } from "./DataTable";
import { money } from "@/lib/format";

interface VentasPerdidasSectionLegacyProps {
  datos: VentasPerdidaMetrica[];
  hideSucursalColumn?: boolean;
}

/**
 * Versión anterior al rediseño "por unidad" — ver CotizacionesSectionLegacy.
 */
export function VentasPerdidasSectionLegacy({
  datos,
  hideSucursalColumn = false,
}: VentasPerdidasSectionLegacyProps) {
  if (!datos || datos.length === 0) return null;

  // Se muestran siempre las 5 unidades (aunque una no haya reportado ventas
  // perdidas este mes) para que el grid no se reacomode como si solo
  // existieran las que sí tuvieron movimiento.
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

      {/* Unit summary cards — auto-fit: si faltan unidades activas las
          tarjetas se reparten el ancho completo en vez de dejar una columna
          vacía. */}
      <div
        className="grid gap-3 mb-6"
        style={{ gridTemplateColumns: `repeat(${datos.length}, minmax(0, 1fr))` }}
      >
        {datos.map((unidad) => (
          <BusinessUnitCard
            key={unidad.unidad}
            label={unidad.unidad}
            monto={unidad.monto}
            porcentaje={unidad.porcentaje}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
