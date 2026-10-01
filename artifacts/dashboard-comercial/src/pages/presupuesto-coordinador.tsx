import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { money } from "@/lib/format";

type AdvisorAllocation = {
  advisorId: string;
  advisor: string;
  codigoAsesor: string;
  participacion: number;
  monto: number;
  ventaBase: number;
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

type BudgetData = {
  anio: number;
  sucursales: Array<{ id: string; nombre: string }>;
  rows: BudgetRow[];
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "No se pudo completar la operación.");
  }
  return response.json();
}

function keyOf(
  row: Pick<BudgetRow, "sucursalId" | "unidadNegocioId" | "mes">,
  advisorId?: string,
) {
  return `${row.sucursalId}:${row.unidadNegocioId}:${row.mes}${advisorId ? `:${advisorId}` : ""}`;
}

function origenLabel(origin: string) {
  if (origin === "guardado") return "Distribución guardada";
  if (origin === "nuevo_asesor_sin_asignacion")
    return "Asesor nuevo para esta distribución; asigna su participación";
  if (origin === "venta_mismo_mes_anterior")
    return "Sugerencia: venta del mismo mes del año anterior";
  if (origin === "venta_anual_anterior")
    return "Sugerencia: participación en venta del año anterior";
  return "Sugerencia inicial: partes iguales";
}

export default function PresupuestoCoordinadorPage() {
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();
  const [branchId, setBranchId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  const query = useQuery<BudgetData>({
    queryKey: ["presupuestos", "asesores", year],
    queryFn: () => api(`/presupuestos/asesores?anio=${year}`),
  });
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    if (!branchId || !data.sucursales.some((item) => item.id === branchId))
      setBranchId(data.sucursales[0]?.id ?? "");
    if (!dirty) {
      const next: Record<string, number> = {};
      data.rows.forEach((row) =>
        row.asesores.forEach((advisor) => {
          next[keyOf(row, advisor.advisorId)] = advisor.participacion;
        }),
      );
      setDraft(next);
    }
  }, [data, branchId, dirty]);

  const branchRows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.sucursalId === branchId),
    [data?.rows, branchId],
  );
  const units = useMemo(
    () => [
      ...new Map(
        branchRows.map((row) => [
          row.unidadNegocioId,
          { id: row.unidadNegocioId, nombre: row.unidad },
        ]),
      ).values(),
    ],
    [branchRows],
  );
  useEffect(() => {
    if (units.length && !units.some((unit) => unit.id === unitId))
      setUnitId(units[0]!.id);
  }, [units, unitId]);
  useEffect(() => {
    if (
      branchRows.length &&
      !branchRows.some(
        (row) => row.unidadNegocioId === unitId && row.mes === month,
      )
    ) {
      setMonth(
        branchRows.find((row) => row.unidadNegocioId === unitId)?.mes ??
          branchRows[0]!.mes,
      );
    }
  }, [branchRows, unitId, month]);

  const currentRow = branchRows.find(
    (row) => row.unidadNegocioId === unitId && row.mes === month,
  );
  const amounts = useMemo(() => {
    if (!currentRow) return new Map<string, number>();
    const cents = Math.round(currentRow.monto * 100);
    const portions = currentRow.asesores.map((advisor) => {
      const share = Number(
        draft[keyOf(currentRow, advisor.advisorId)] ?? advisor.participacion,
      );
      const raw = (cents * share) / 100;
      return {
        id: advisor.advisorId,
        cents: Math.floor(raw),
        remainder: raw - Math.floor(raw),
      };
    });
    let unassigned =
      cents - portions.reduce((sum, item) => sum + item.cents, 0);
    portions.sort(
      (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
    );
    for (
      let index = 0;
      index < portions.length && unassigned > 0;
      index += 1, unassigned -= 1
    )
      portions[index]!.cents += 1;
    return new Map(portions.map((item) => [item.id, item.cents / 100]));
  }, [currentRow, draft]);
  const allSharesValid = (data?.rows ?? []).every((row) => {
    if (row.requiereAsignacionAsesores || row.asesores.length === 0)
      return false;
    const sum = row.asesores.reduce(
      (total, advisor) =>
        total +
        Number(draft[keyOf(row, advisor.advisorId)] ?? advisor.participacion),
      0,
    );
    return Math.abs(sum - 100) <= 0.000005;
  });

  const save = useMutation({
    mutationFn: () =>
      api("/presupuestos/asesores", {
        method: "PUT",
        body: JSON.stringify({
          anio: year,
          rows: (data?.rows ?? []).flatMap((row) =>
            row.asesores.map((advisor) => ({
              sucursalId: row.sucursalId,
              unidadNegocioId: row.unidadNegocioId,
              mes: row.mes,
              asesorId: advisor.advisorId,
              participacion: Number(
                draft[keyOf(row, advisor.advisorId)] ?? advisor.participacion,
              ),
            })),
          ),
        }),
      }),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["presupuestos", "asesores", year],
      });
    },
  });

  const updateShare = (
    row: BudgetRow,
    advisor: AdvisorAllocation,
    value: number,
  ) => {
    setDirty(true);
    setDraft((previous) => ({
      ...previous,
      [keyOf(row, advisor.advisorId)]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planeación de sucursal"
        title={`Presupuesto por asesor ${year}`}
        description="Distribuye por unidad y mes el monto que Gerencia ya asignó a tu sucursal. Los porcentajes se convierten automáticamente en montos y no cambian la meta oficial."
      />

      <Card>
        <CardHeader>
          <CardTitle>Distribución de metas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                Sucursal asignada
              </span>
              <select
                aria-label="Sucursal asignada"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3"
              >
                {(data?.sucursales ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                Unidad de negocio
              </span>
              <select
                aria-label="Unidad de negocio"
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3"
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Mes</span>
              <select
                aria-label="Mes del presupuesto"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-input bg-background px-3"
              >
                {MESES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {query.isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando metas de tu sucursal…
            </p>
          )}
          {query.error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {query.error.message}
            </p>
          )}
          {!query.isLoading && !query.error && !data?.rows.length && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay metas mensuales asignadas a tu sucursal. Gerencia debe
              aprobar y asignar el presupuesto de unidad antes de repartirlo.
            </div>
          )}

          {currentRow && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-muted/40 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Meta asignada · {currentRow.unidad} · {MESES[month - 1]}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {money(currentRow.monto)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  La suma de participación debe ser 100 %
                </p>
              </div>

              {currentRow.requiereAsignacionAsesores ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay asesores vinculados a esta combinación. Confirma que
                  tengan la unidad asignada en su perfil o ventas históricas
                  de esa unidad en la sucursal. No incluimos asesores en
                  unidades donde falta esa evidencia.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="p-3">Asesor</th>
                        <th className="p-3 text-right">
                          Venta mismo mes año anterior
                        </th>
                        <th className="p-3 text-right">
                          Participación editable
                        </th>
                        <th className="p-3 text-right">Monto asignado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRow.asesores.map((advisor) => {
                        const share = Number(
                          draft[keyOf(currentRow, advisor.advisorId)] ??
                            advisor.participacion,
                        );
                        return (
                          <tr
                            key={advisor.advisorId}
                            className="border-b last:border-0"
                          >
                            <td className="p-3">
                              <span className="font-medium">
                                {advisor.advisor}
                              </span>
                              {advisor.codigoAsesor && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {advisor.codigoAsesor}
                                </span>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {origenLabel(advisor.origen)}
                              </p>
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {money(advisor.ventaBase)}
                            </td>
                            <td className="w-48 p-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  aria-label={`Participación de ${advisor.advisor}`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={Number.isFinite(share) ? share : 0}
                                  onChange={(event) =>
                                    updateShare(
                                      currentRow,
                                      advisor,
                                      Number(event.target.value),
                                    )
                                  }
                                  className="text-right tabular-nums"
                                />
                                <span>%</span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-medium tabular-nums">
                              {money(amounts.get(advisor.advisorId) ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 font-semibold">
                        <td className="p-3">Total</td>
                        <td className="p-3 text-right">
                          {money(
                            currentRow.asesores.reduce(
                              (sum, advisor) => sum + advisor.ventaBase,
                              0,
                            ),
                          )}
                        </td>
                        <td
                          className={`p-3 text-right ${Math.abs(currentRow.asesores.reduce((sum, advisor) => sum + Number(draft[keyOf(currentRow, advisor.advisorId)] ?? advisor.participacion), 0) - 100) > 0.000005 ? "text-destructive" : "text-primary"}`}
                        >
                          {currentRow.asesores
                            .reduce(
                              (sum, advisor) =>
                                sum +
                                Number(
                                  draft[keyOf(currentRow, advisor.advisorId)] ??
                                    advisor.participacion,
                                ),
                              0,
                            )
                            .toFixed(2)}{" "}
                          %
                        </td>
                        <td className="p-3 text-right">
                          {money(currentRow.monto)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  La sugerencia inicial usa la venta del mismo mes del año
                  anterior; si no existe, usa la participación anual histórica
                  y, en último caso, reparte en partes iguales. Puedes
                  ajustarla.
                </p>
                <Button
                  onClick={() => save.mutate()}
                  disabled={
                    !dirty ||
                    !allSharesValid ||
                    save.isPending ||
                    !data?.rows.length
                  }
                >
                  {save.isPending
                    ? "Guardando…"
                    : "Guardar distribuciones de tus sucursales"}
                </Button>
              </div>
              {!allSharesValid && data?.rows.length ? (
                <p role="alert" className="text-sm text-destructive">
                  Revisa todos los meses y unidades: cada distribución debe
                  sumar 100 % y debe existir al menos un asesor elegible.
                </p>
              ) : null}
              {save.error && (
                <p role="alert" className="text-sm text-destructive">
                  {save.error.message}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
