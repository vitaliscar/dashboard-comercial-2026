import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { money } from "@/lib/format";

type AdvisorAllocation = {
  advisorId: string;
  advisor: string;
  codigoAsesor: string;
  participacion: number;
  monto: number;
  origen: string;
  activoEnAnio: boolean;
};

type BudgetRow = {
  anio: number;
  mes: number;
  sucursalId: string;
  sucursal: string;
  unidadNegocioId: string;
  unidad: string;
  monto: number;
  asesores: AdvisorAllocation[];
  requiereAsignacionAsesores: boolean;
};

type BudgetData = { anio: number; rows: BudgetRow[] };
type BudgetVersion = {
  id: string;
  nombre: string;
  estado: string;
  createdAt: string;
  premisas?: {
    tipo?: string;
    crecimientoAnualPct?: number;
    metaPropuesta?: number | string;
    metaTotalConGestion?: number | string;
    unidades?: Array<{ unidadNegocioId: string | null; participacion: number; gestionComercialPct: number; gestionComercialMonto?: number | null }>;
    sucursales?: Array<{ unidadNegocioId: string | null; sucursalId: string | null; participacion: number }>;
    meses?: Array<{ unidadNegocioId: string | null; mes: number; participacion: number }>;
  } | null;
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

async function fetchAdvisorBudgets(year: number): Promise<BudgetData> {
  const response = await fetch(`/api/presupuestos/asesores?anio=${year}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "No se pudo cargar la distribución por asesor.");
  }
  return response.json();
}

function sourceLabel(source: string) {
  if (source === "guardado") return "Distribución guardada";
  if (source === "nuevo_asesor_sin_asignacion") return "Pendiente de asignación";
  if (source === "venta_mismo_mes_anterior") return "Sugerencia por venta del mismo mes";
  if (source === "venta_anual_anterior") return "Sugerencia por venta anual";
  return "Sugerencia inicial equitativa";
}

export function ManagementBudgetOverview({
  year,
  versions,
  units,
  branches,
}: {
  year: number;
  versions: BudgetVersion[];
  units: Array<{ id: string; nombre: string }>;
  branches: Array<{ id: string; nombre: string }>;
}) {
  const query = useQuery({
    queryKey: ["presupuestos", "asesores", "vista-gerencial", year],
    queryFn: () => fetchAdvisorBudgets(year),
    staleTime: 60_000,
  });
  const rows = query.data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.monto, 0);
  const branchCount = new Set(rows.map((row) => row.sucursalId)).size;
  const unitCount = new Set(rows.map((row) => row.unidadNegocioId)).size;
  const advisorCount = new Set(rows.flatMap((row) => row.asesores.map((advisor) => advisor.advisorId))).size;
  const savedCount = rows.filter((row) => row.asesores.length > 0 && row.asesores.every((advisor) => advisor.origen === "guardado")).length;

  return (
    <Card id="budget-overview" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Vista consolidada · {year}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Lectura global de metas por unidad, sucursal y mes, con su distribución por asesor. Este panel no habilita edición.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando distribución aprobada…</p>}
        {query.isError && <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo cargar la vista consolidada." />}
        {query.data && <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Presupuesto anual visible</dt><dd className="mt-1 font-semibold tabular-nums">{money(total)}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Unidades</dt><dd className="mt-1 font-semibold tabular-nums">{unitCount}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Sucursales</dt><dd className="mt-1 font-semibold tabular-nums">{branchCount}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Asesores</dt><dd className="mt-1 font-semibold tabular-nums">{advisorCount}</dd></div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{savedCount} de {rows.length} grupos tienen distribución de asesores guardada.</span>
            <span>Los demás montos por asesor son sugerencias y no se han guardado.</span>
          </div>

          <div className="max-h-[42rem] space-y-2 overflow-auto" aria-label="Presupuestos por unidad, sucursal y asesor">
            {rows.map((row) => (
              <details key={`${row.sucursalId}:${row.unidadNegocioId}:${row.mes}`} className="rounded-lg border">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-3 text-sm">
                  <span className="min-w-40 font-medium">{row.sucursal}</span>
                  <span className="min-w-32 text-muted-foreground">{row.unidad} · {MONTHS[row.mes - 1] ?? row.mes}</span>
                  <span className="font-semibold tabular-nums">{money(row.monto)}</span>
                  <span className="text-xs text-muted-foreground">{row.asesores.length} asesores</span>
                </summary>
                <div className="border-t px-3 py-2">
                  {row.requiereAsignacionAsesores ? (
                    <p className="py-2 text-sm text-muted-foreground">No hay asesores asignables para esta sucursal y unidad.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[34rem] text-sm">
                        <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Asesor</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3 text-right">Participación</th><th className="py-2 text-right">Monto</th></tr></thead>
                        <tbody>{row.asesores.map((advisor) => (
                          <tr key={advisor.advisorId} className="border-b last:border-0">
                            <td className="py-2 pr-3">{advisor.advisor}{advisor.codigoAsesor ? <span className="ml-2 text-xs text-muted-foreground">{advisor.codigoAsesor}</span> : null}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{sourceLabel(advisor.origen)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{advisor.participacion.toFixed(2)} %</td>
                            <td className="py-2 text-right tabular-nums">{money(advisor.monto)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))}
            {rows.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No hay presupuesto mensual por sucursal para {year}.</p>}
          </div>

          <section className="space-y-2" aria-labelledby="budget-premises-title">
            <div><h3 id="budget-premises-title" className="font-semibold">Versiones y premisas registradas</h3><p className="text-sm text-muted-foreground">Consulta crecimiento, pesos de unidad y distribución por sucursal y mes guardados en cada versión.</p></div>
            {versions.map((version) => {
              const premises = version.premisas;
              const amount = premises?.metaTotalConGestion ?? premises?.metaPropuesta;
              return <details key={version.id} className="rounded-lg border">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                  <span className="font-medium">{version.nombre}</span>
                  <span className="text-muted-foreground">{version.estado} · {new Date(version.createdAt).toLocaleDateString("es-VE")}</span>
                  {amount != null && <span className="font-semibold tabular-nums">{money(Number(amount))}</span>}
                </summary>
                <div className="grid gap-4 border-t px-3 py-3 text-sm md:grid-cols-3">
                  <div><h4 className="mb-2 font-medium">Unidades y gestión</h4>{premises?.unidades?.length ? premises.unidades.map((unit, index) => <p key={`${unit.unidadNegocioId ?? "none"}:${index}`} className="text-muted-foreground">{units.find((item) => item.id === unit.unidadNegocioId)?.nombre ?? "Unidad"}: {unit.participacion.toFixed(2)} % · GC {unit.gestionComercialPct.toFixed(2)} %</p>) : <p className="text-muted-foreground">Sin detalle de pesos por unidad.</p>}</div>
                  <div><h4 className="mb-2 font-medium">Sucursales</h4>{premises?.sucursales?.length ? premises.sucursales.map((branch, index) => <p key={`${branch.unidadNegocioId ?? "none"}:${branch.sucursalId ?? "none"}:${index}`} className="text-muted-foreground">{branches.find((item) => item.id === branch.sucursalId)?.nombre ?? "Sucursal"}: {branch.participacion.toFixed(2)} %</p>) : <p className="text-muted-foreground">Sin detalle de sucursales.</p>}</div>
                  <div><h4 className="mb-2 font-medium">Meses</h4>{premises?.meses?.length ? premises.meses.map((month, index) => <p key={`${month.unidadNegocioId ?? "none"}:${month.mes}:${index}`} className="text-muted-foreground">{MONTHS[month.mes - 1] ?? month.mes}: {month.participacion.toFixed(2)} %</p>) : <p className="text-muted-foreground">Sin detalle mensual.</p>}</div>
                  {premises?.crecimientoAnualPct != null && <p className="text-muted-foreground md:col-span-3">Crecimiento anual: {premises.crecimientoAnualPct.toFixed(2)} %</p>}
                </div>
              </details>;
            })}
            {versions.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay versiones guardadas para {year}.</p>}
          </section>

          <div className="rounded-lg border border-dashed p-4 text-sm" role="note">
            <h3 className="font-medium">Distribución por marca o premisa</h3>
            <p className="mt-1 text-muted-foreground">El modelo actual guarda crecimiento y distribución por unidad, sucursal y mes. No tiene registros persistidos de presupuesto por marca o premisa para mostrar aquí; los mixes de ventas no se presentan como metas presupuestarias.</p>
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
