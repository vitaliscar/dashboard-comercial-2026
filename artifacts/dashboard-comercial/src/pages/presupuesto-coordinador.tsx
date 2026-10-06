import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { money } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [bulkShares, setBulkShares] = useState("");
  const [bulkSharesError, setBulkSharesError] = useState("");
  const [bulkSharesApplied, setBulkSharesApplied] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

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
  const missingRosterScopes = useMemo(
    () =>
      [
        ...new Map(
          (data?.rows ?? [])
            .filter((row) => row.requiereAsignacionAsesores || row.asesores.length === 0)
            .map((row) => [
              `${row.sucursalId}:${row.unidadNegocioId}`,
              { sucursal: row.sucursal, unidad: row.unidad },
            ]),
        ).values(),
      ],
    [data?.rows],
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
  const saveScope = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      branches: new Set(rows.map((row) => row.sucursalId)).size,
      units: new Set(rows.map((row) => row.unidadNegocioId)).size,
      months: new Set(rows.map((row) => row.mes)).size,
      advisorAllocations: rows.reduce((count, row) => count + row.asesores.length, 0),
      targetAmount: rows.reduce((sum, row) => sum + Number(row.monto || 0), 0),
    };
  }, [data?.rows]);

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

  const applyBulkShares = () => {
    if (!currentRow) return;
    const values = bulkShares
      .split(/[\t\n;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value.replace(/%/g, "").replace(",", ".")));
    if (values.length !== currentRow.asesores.length) {
      setBulkSharesError(`Pega exactamente ${currentRow.asesores.length} porcentajes, en el mismo orden de los asesores.`);
      setBulkSharesApplied(false);
      return;
    }
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setBulkSharesError("Cada porcentaje debe ser un número entre 0 y 100.");
      setBulkSharesApplied(false);
      return;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.01) {
      setBulkSharesError(`La suma debe ser 100 %. El valor pegado suma ${total.toFixed(2)} %.`);
      setBulkSharesApplied(false);
      return;
    }
    setDirty(true);
    setDraft((previous) => ({
      ...previous,
      ...Object.fromEntries(currentRow.asesores.map((advisor, index) => [keyOf(currentRow, advisor.advisorId), values[index]!])),
    }));
    setBulkSharesError("");
    setBulkSharesApplied(true);
  };

  const discardChanges = () => {
    const next: Record<string, number> = {};
    (data?.rows ?? []).forEach((row) =>
      row.asesores.forEach((advisor) => {
        next[keyOf(row, advisor.advisorId)] = advisor.participacion;
      }),
    );
    setDraft(next);
    setDirty(false);
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
            <QueryErrorNotice
              error={query.error}
              onRetry={() => void query.refetch()}
              fallback="No se pudo cargar el roster y las metas dentro de tus sucursales."
            />
          )}
          {!query.isLoading && !query.error && !data?.rows.length && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay metas mensuales asignadas a tu sucursal. Gerencia debe
              aprobar y asignar el presupuesto de unidad antes de repartirlo.
            </div>
          )}

          {missingRosterScopes.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm" role="alert">
              <p className="font-semibold">Guardado anual bloqueado: faltan asesores asignados</p>
              <p className="mt-1 text-muted-foreground">
                {missingRosterScopes.length} combinación(es) de sucursal y unidad no tienen padrón. Cada asesor debe tener asignadas su sucursal y unidad de negocio en el perfil. Solicita a Gerencia Nacional o Administración que complete esas asignaciones; el guardado requiere distribuir el 100 % de todas las metas mensuales de tu sucursal.
              </p>
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
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>La suma de participación debe ser 100 %</span>
                  {currentRow.asesores.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => {
                    const advisors = currentRow.asesores;
                    const basisPoints = Math.floor(10000 / advisors.length);
                    const remainder = 10000 - basisPoints * advisors.length;
                    setDirty(true);
                    setDraft((previous) => ({ ...previous, ...Object.fromEntries(advisors.map((advisor, index) => [keyOf(currentRow, advisor.advisorId), (basisPoints + (index === advisors.length - 1 ? remainder : 0)) / 100])) }));
                  }}>Repartir por igual</Button>}
                </div>
              </div>

              {currentRow.asesores.length > 0 && !currentRow.requiereAsignacionAsesores && <details className="rounded-lg border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">Pegar porcentajes en lote</summary>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Pega un porcentaje por asesor, en el orden de la lista, separado por filas o tabulaciones. Deben sumar 100 %.</p>
                  <Textarea aria-label="Porcentajes de participación por asesor" value={bulkShares} onChange={(event) => { setBulkShares(event.target.value); setBulkSharesError(""); setBulkSharesApplied(false); }} placeholder={`Ejemplo: 40\n35\n25`} rows={4} />
                  <Button type="button" size="sm" variant="outline" onClick={applyBulkShares}>Validar y aplicar</Button>
                  {bulkSharesError && <p role="alert" className="text-sm text-destructive">{bulkSharesError}</p>}
                  {bulkSharesApplied && <p role="status" aria-live="polite" className="text-sm text-success">Porcentajes aplicados. Revisa los montos y el alcance antes de guardar.</p>}
                </div>
              </details>}

              {currentRow.requiereAsignacionAsesores ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No hay asesores elegibles para esta sucursal y unidad. Para
                  aparecer en el reparto, cada perfil debe tener ambas
                  asignaciones y el asesor debe estar activo. Gerencia Nacional
                  o Administración debe completar el padrón. No se guardará
                  una distribución incompleta.
                </div>
              ) : (
                <>
                <div className="hidden overflow-x-auto rounded-lg border xl:block">
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
                <div className="space-y-3 xl:hidden" aria-label="Distribución del presupuesto por asesor">
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Venta base del grupo</p><p className="font-medium tabular-nums">{money(currentRow.asesores.reduce((sum, advisor) => sum + advisor.ventaBase, 0))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Meta del período</p><p className="font-medium tabular-nums">{money(currentRow.monto)}</p></div>
                  </div>
                  {currentRow.asesores.map((advisor) => {
                    const share = Number(draft[keyOf(currentRow, advisor.advisorId)] ?? advisor.participacion);
                    return <section key={advisor.advisorId} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{advisor.advisor}</h3>{advisor.codigoAsesor && <p className="text-xs text-muted-foreground">{advisor.codigoAsesor}</p>}</div><p className="text-right text-sm font-semibold tabular-nums">{money(amounts.get(advisor.advisorId) ?? 0)}</p></div>
                      <p className="mt-1 text-xs text-muted-foreground">{origenLabel(advisor.origen)} · Venta base {money(advisor.ventaBase)}</p>
                      <label className="mt-3 block text-xs font-medium text-muted-foreground">Participación (%)<Input aria-label={`Participación de ${advisor.advisor}`} type="number" min="0" max="100" step="0.01" value={Number.isFinite(share) ? share : 0} onChange={(event) => updateShare(currentRow, advisor, Number(event.target.value))} className="mt-1 text-right tabular-nums" /></label>
                    </section>;
                  })}
                  <div className="flex justify-between border-t pt-3 text-sm font-semibold"><span>Participación total</span><span className={Math.abs(currentRow.asesores.reduce((sum, advisor) => sum + Number(draft[keyOf(currentRow, advisor.advisorId)] ?? advisor.participacion), 0) - 100) > 0.000005 ? "text-destructive" : "text-primary"}>{currentRow.asesores.reduce((sum, advisor) => sum + Number(draft[keyOf(currentRow, advisor.advisorId)] ?? advisor.participacion), 0).toFixed(2)} %</span></div>
                </div>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  La sugerencia inicial usa la venta del mismo mes del año
                  anterior; si no existe, usa la participación anual histórica
                  y, en último caso, reparte en partes iguales. Puedes
                  ajustarla.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {dirty && (
                    <Button type="button" variant="outline" onClick={discardChanges} disabled={save.isPending}>
                      Descartar cambios
                    </Button>
                  )}
                  <Button
                    onClick={() => setConfirmSaveOpen(true)}
                    disabled={
                      !dirty ||
                      !allSharesValid ||
                      save.isPending ||
                      !data?.rows.length
                    }
                  >
                    {save.isPending
                      ? "Guardando…"
                      : "Guardar distribuciones"}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm" role="note">
                <p className="font-semibold">Alcance de este guardado</p>
                <p className="mt-1 text-muted-foreground">Se guardarán {saveScope.advisorAllocations} repartos de asesores en {saveScope.branches} sucursal(es), {saveScope.units} unidad(es) y {saveScope.months} mes(es) de {year}. Incluye todas tus sucursales y sus demás unidades y meses, no solo la selección actual.</p>
              </div>
              {dirty && <p className="text-xs font-medium text-warning" role="status">Cambios sin guardar. Revisa el alcance antes de confirmar.</p>}
              {save.isSuccess && !dirty && <p className="text-xs font-medium text-success" role="status">Distribución guardada para todas tus sucursales.</p>}
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
          <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Guardar distribución anual</AlertDialogTitle>
                <AlertDialogDescription>Este envío actualiza el reparto de todas las metas de asesor dentro de tus sucursales autorizadas.</AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                <dt className="text-muted-foreground">Año</dt><dd className="text-right">{year}</dd>
                <dt className="text-muted-foreground">Sucursales</dt><dd className="text-right">{saveScope.branches}</dd>
                <dt className="text-muted-foreground">Unidades × meses</dt><dd className="text-right">{saveScope.units} × {saveScope.months}</dd>
                <dt className="text-muted-foreground">Repartos de asesor</dt><dd className="text-right">{saveScope.advisorAllocations}</dd>
                <dt className="text-muted-foreground">Meta total</dt><dd className="text-right font-semibold tabular-nums">{money(saveScope.targetAmount)}</dd>
              </dl>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={save.isPending}>Seguir editando</AlertDialogCancel>
                <AlertDialogAction disabled={save.isPending} onClick={() => { setConfirmSaveOpen(false); save.mutate(); }}>{save.isPending ? "Guardando…" : "Confirmar guardado"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
