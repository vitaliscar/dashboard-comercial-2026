import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { budgetMoney as money } from "@/components/budget/format";

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
type MixRecord = {
  nivel: string;
  unidadId: string;
  sucursalId: string | null;
  mes: number | null;
  asesorId: string | null;
  itemKey: string;
  participacion: number;
  monto: number;
};
type MixData = { versionId: string | null; records: MixRecord[] };
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
    unidades?: Array<{
      unidadNegocioId: string | null;
      participacion: number;
      gestionComercialPct: number;
      gestionComercialMonto?: number | null;
    }>;
    sucursales?: Array<{
      unidadNegocioId: string | null;
      sucursalId: string | null;
      participacion: number;
    }>;
    meses?: Array<{
      unidadNegocioId: string | null;
      mes: number;
      participacion: number;
    }>;
  } | null;
};

const MONTHS = [
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

async function fetchAdvisorBudgets(year: number): Promise<BudgetData> {
  const response = await fetch(`/api/presupuestos/asesores?anio=${year}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ?? "No se pudo cargar la distribución por asesor.",
    );
  }
  return response.json();
}

async function fetchSavedMix(
  year: number,
  versionId: string,
): Promise<MixData> {
  const response = await fetch(
    `/api/presupuestos/mix?anio=${year}&versionId=${encodeURIComponent(versionId)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "No se pudo cargar el mix aprobado.");
  }
  return response.json();
}

const MIX_LABELS: Record<string, string> = {
  caterpillar: "Caterpillar",
  blumaq: "Blumaq",
  otros: "Otros",
  chronus: "Chronus · Lubricantes",
  donaldson: "Donaldson · Filtros",
  csa: "CSA",
  otras: "Otras",
  generac: "Generac",
  weichai: "Weichai",
  ep_equipment: "EP Equipment",
  comercial: "Comercial",
  industrial: "Industrial",
  residencial: "Residencial",
};

function SavedMix({ title, records }: { title: string; records: MixRecord[] }) {
  return (
    <section className="rounded-lg border p-3" aria-label={title}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {records.length ? (
        <div className="mt-2 space-y-1">
          {records.map((record) => (
            <div
              key={record.itemKey}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span>{MIX_LABELS[record.itemKey] ?? record.itemKey}</span>
              <span className="shrink-0 text-right tabular-nums">
                {Number(record.participacion).toFixed(2)} % ·{" "}
                {money(Number(record.monto))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Sin reparto guardado para este nivel.
        </p>
      )}
    </section>
  );
}

function sourceLabel(source: string) {
  if (source === "guardado") return "Distribución guardada";
  if (source === "nuevo_asesor_sin_asignacion")
    return "Pendiente de asignación";
  if (source === "venta_mismo_mes_anterior")
    return "Sugerencia por venta del mismo mes";
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
  const [requestedUnitId, setRequestedUnitId] = useState("");
  const [requestedBranchId, setRequestedBranchId] = useState("");
  const [requestedMonth, setRequestedMonth] = useState(0);
  const query = useQuery({
    queryKey: ["presupuestos", "asesores", "vista-gerencial", year],
    queryFn: () => fetchAdvisorBudgets(year),
    staleTime: 60_000,
  });
  const rows = query.data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.monto, 0);
  const branchCount = new Set(rows.map((row) => row.sucursalId)).size;
  const unitCount = new Set(rows.map((row) => row.unidadNegocioId)).size;
  const advisorCount = new Set(
    rows.flatMap((row) => row.asesores.map((advisor) => advisor.advisorId)),
  ).size;
  const savedCount = rows.filter(
    (row) =>
      row.asesores.length > 0 &&
      row.asesores.every((advisor) => advisor.origen === "guardado"),
  ).length;
  const approvedVersion = versions.find(
    (version) => version.estado === "aprobado",
  );
  const mixQuery = useQuery({
    queryKey: [
      "presupuestos",
      "mix",
      "vista-gerencial",
      year,
      approvedVersion?.id,
    ],
    queryFn: () => fetchSavedMix(year, approvedVersion!.id),
    enabled: Boolean(approvedVersion?.id),
    staleTime: 60_000,
  });
  const unitChoices = useMemo(
    () => [
      ...new Map(
        rows.map((row) => [row.unidadNegocioId, row.unidad]),
      ).entries(),
    ],
    [rows],
  );
  const unitId = unitChoices.some(([id]) => id === requestedUnitId)
    ? requestedUnitId
    : (unitChoices[0]?.[0] ?? "");
  const unitRows = rows.filter((row) => row.unidadNegocioId === unitId);
  const branchChoices = [
    ...new Map(unitRows.map((row) => [row.sucursalId, row.sucursal])).entries(),
  ];
  const branchId = branchChoices.some(([id]) => id === requestedBranchId)
    ? requestedBranchId
    : (branchChoices[0]?.[0] ?? "");
  const branchRows = unitRows
    .filter((row) => row.sucursalId === branchId)
    .sort((a, b) => a.mes - b.mes);
  const unitAmount = unitRows.reduce((sum, row) => sum + row.monto, 0);
  const branchAmount = branchRows.reduce((sum, row) => sum + row.monto, 0);
  const unitSummaries = unitChoices.map(([id, name]) => ({
    id,
    name,
    amount: rows
      .filter((row) => row.unidadNegocioId === id)
      .reduce((sum, row) => sum + row.monto, 0),
  }));
  const branchSummaries = branchChoices
    .map(([id, name]) => ({
      id,
      name,
      amount: unitRows
        .filter((row) => row.sucursalId === id)
        .reduce((sum, row) => sum + row.monto, 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  const month = branchRows.some((row) => row.mes === requestedMonth)
    ? requestedMonth
    : (branchRows[0]?.mes ?? 0);
  const monthRow = branchRows.find((row) => row.mes === month);
  const mixRecords = mixQuery.data?.records ?? [];
  const savedMix = (nivel: string, advisorId = "") =>
    mixRecords.filter(
      (record) =>
        record.nivel === nivel &&
        record.unidadId === unitId &&
        (nivel === "unidad" ||
          (record.sucursalId === branchId &&
            record.mes === month &&
            (nivel !== "asesor_mes" || record.asesorId === advisorId))),
    );

  return (
    <Card id="budget-overview" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Mapa del presupuesto · {year}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Recorre la meta aprobada desde la unidad hasta cada asesor. Los montos
          sugeridos y los repartos guardados se identifican por separado.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando distribución aprobada…
          </p>
        )}
        {query.isError && (
          <QueryErrorNotice
            error={query.error}
            onRetry={() => void query.refetch()}
            fallback="No se pudo cargar la vista consolidada."
          />
        )}
        {query.data && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">
                  Presupuesto anual visible
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {money(total)}
                </dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Unidades</dt>
                <dd className="mt-1 font-semibold tabular-nums">{unitCount}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Sucursales</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {branchCount}
                </dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Asesores</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {advisorCount}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {savedCount} de {rows.length} grupos tienen distribución de
                asesores guardada.
              </span>
              <span>
                Los demás montos por asesor son sugerencias y no se han
                guardado.
              </span>
            </div>

            {rows.length > 0 ? (
              <section
                className="ccv-budget-explorer"
                aria-label="Explorador de presupuesto por unidad, sucursal, mes y asesor"
              >
                <div
                  className="ccv-budget-explorer-path"
                  aria-label="Nivel seleccionado"
                >
                  <span>Meta anual</span>
                  <span>{unitChoices.find(([id]) => id === unitId)?.[1]}</span>
                  <span>
                    {branchChoices.find(([id]) => id === branchId)?.[1]}
                  </span>
                  <span>{MONTHS[month - 1] ?? "Mes"}</span>
                </div>
                <div className="ccv-budget-explorer-controls">
                  <div
                    role="group"
                    aria-label="Presupuesto por unidad de negocio"
                  >
                    <h3>Unidades de negocio</h3>
                    <div className="ccv-budget-explorer-choice-list">
                      {unitSummaries.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          aria-pressed={unitId === unit.id}
                          onClick={() => {
                            setRequestedUnitId(unit.id);
                            setRequestedBranchId("");
                            setRequestedMonth(0);
                          }}
                        >
                          <span>{unit.name}</span>
                          <strong>
                            {money(unit.amount)}{" "}
                            <small>
                              {(total > 0
                                ? (unit.amount / total) * 100
                                : 0
                              ).toFixed(1)}{" "}
                              %
                            </small>
                          </strong>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    role="group"
                    aria-label="Presupuesto por sucursal de la unidad"
                  >
                    <h3>
                      Sucursales de{" "}
                      {unitChoices.find(([id]) => id === unitId)?.[1]}
                    </h3>
                    <div className="ccv-budget-explorer-choice-list ccv-budget-explorer-branches">
                      {branchSummaries.map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          aria-pressed={branchId === branch.id}
                          onClick={() => {
                            setRequestedBranchId(branch.id);
                            setRequestedMonth(0);
                          }}
                        >
                          <span>{branch.name}</span>
                          <strong>
                            {money(branch.amount)}{" "}
                            <small>
                              {(unitAmount > 0
                                ? (branch.amount / unitAmount) * 100
                                : 0
                              ).toFixed(1)}{" "}
                              %
                            </small>
                          </strong>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="ccv-budget-explorer-totals">
                  <div>
                    <span>Meta de la unidad</span>
                    <strong>{money(unitAmount)}</strong>
                  </div>
                  <div>
                    <span>Meta de la sucursal</span>
                    <strong>{money(branchAmount)}</strong>
                  </div>
                  <div>
                    <span>Meta del mes</span>
                    <strong>{money(monthRow?.monto ?? 0)}</strong>
                  </div>
                </div>
                {approvedVersion && (
                  <p className="text-xs text-muted-foreground">
                    Mix guardado en la versión aprobada:{" "}
                    {approvedVersion.nombre}. La distribución de asesores
                    corresponde al presupuesto vigente.
                  </p>
                )}
                {mixQuery.isError && (
                  <QueryErrorNotice
                    error={mixQuery.error}
                    onRetry={() => void mixQuery.refetch()}
                    fallback="No se pudo cargar el mix guardado."
                  />
                )}
                <SavedMix
                  title="Participación por marca o premisa · unidad"
                  records={savedMix("unidad")}
                />
                <div
                  className="ccv-budget-explorer-months"
                  role="group"
                  aria-label="Mes de la sucursal"
                >
                  {branchRows.map((row) => (
                    <button
                      key={row.mes}
                      type="button"
                      aria-pressed={month === row.mes}
                      onClick={() => setRequestedMonth(row.mes)}
                    >
                      <span>{MONTHS[row.mes - 1]}</span>
                      <strong>
                        {money(row.monto)}{" "}
                        <small>
                          {(branchAmount > 0
                            ? (row.monto / branchAmount) * 100
                            : 0
                          ).toFixed(1)}{" "}
                          %
                        </small>
                      </strong>
                    </button>
                  ))}
                </div>
                {monthRow && (
                  <>
                    <SavedMix
                      title={`Participación por marca o premisa · ${monthRow.sucursal} · ${MONTHS[monthRow.mes - 1]}`}
                      records={savedMix("sucursal_mes")}
                    />
                    <section
                      className="ccv-budget-explorer-advisors"
                      aria-labelledby="budget-advisors-title"
                    >
                      <div>
                        <h3
                          id="budget-advisors-title"
                          className="font-semibold"
                        >
                          Asesores de la sucursal
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {monthRow.asesores.every(
                            (advisor) => advisor.origen === "guardado",
                          ) && monthRow.asesores.length > 0
                            ? "Distribución guardada"
                            : "Los importes no guardados son sugerencias, no metas aprobadas."}
                        </p>
                      </div>
                      {monthRow.requiereAsignacionAsesores && (
                        <p className="text-sm text-muted-foreground">
                          No hay asesores asignables para esta sucursal y
                          unidad.
                        </p>
                      )}
                      {monthRow.asesores.map((advisor) => (
                        <details
                          key={advisor.advisorId}
                          className="rounded-lg border"
                        >
                          <summary className="flex cursor-pointer flex-wrap justify-between gap-2 px-3 py-3 text-sm">
                            <span className="font-medium">
                              {advisor.advisor}
                            </span>
                            <span className="text-muted-foreground">
                              {sourceLabel(advisor.origen)}
                            </span>
                            <span className="tabular-nums">
                              {Number(advisor.participacion).toFixed(2)} % ·{" "}
                              {money(Number(advisor.monto))}
                            </span>
                          </summary>
                          <div className="border-t p-3">
                            <SavedMix
                              title={`Marcas o premisas · ${advisor.advisor}`}
                              records={savedMix(
                                "asesor_mes",
                                advisor.advisorId,
                              )}
                            />
                          </div>
                        </details>
                      ))}
                    </section>
                  </>
                )}
              </section>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No hay presupuesto mensual por sucursal para {year}.
              </p>
            )}

            <section
              className="space-y-2"
              aria-labelledby="budget-premises-title"
            >
              <div>
                <h3 id="budget-premises-title" className="font-semibold">
                  Versiones y premisas registradas
                </h3>
                <p className="text-sm text-muted-foreground">
                  Consulta crecimiento, pesos de unidad y distribución por
                  sucursal y mes guardados en cada versión.
                </p>
              </div>
              {versions.map((version) => {
                const premises = version.premisas;
                const amount =
                  premises?.metaTotalConGestion ?? premises?.metaPropuesta;
                return (
                  <details key={version.id} className="rounded-lg border">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                      <span className="font-medium">{version.nombre}</span>
                      <span className="text-muted-foreground">
                        {version.estado} ·{" "}
                        {new Date(version.createdAt).toLocaleDateString(
                          "es-VE",
                        )}
                      </span>
                      {amount != null && (
                        <span className="font-semibold tabular-nums">
                          {money(Number(amount))}
                        </span>
                      )}
                    </summary>
                    <div className="grid gap-4 border-t px-3 py-3 text-sm md:grid-cols-3">
                      <div>
                        <h4 className="mb-2 font-medium">Unidades y gestión</h4>
                        {premises?.unidades?.length ? (
                          premises.unidades.map((unit, index) => (
                            <p
                              key={`${unit.unidadNegocioId ?? "none"}:${index}`}
                              className="text-muted-foreground"
                            >
                              {units.find(
                                (item) => item.id === unit.unidadNegocioId,
                              )?.nombre ?? "Unidad"}
                              : {unit.participacion.toFixed(2)} % · GC{" "}
                              {unit.gestionComercialPct.toFixed(2)} %
                            </p>
                          ))
                        ) : (
                          <p className="text-muted-foreground">
                            Sin detalle de pesos por unidad.
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Sucursales</h4>
                        {premises?.sucursales?.length ? (
                          premises.sucursales.map((branch, index) => (
                            <p
                              key={`${branch.unidadNegocioId ?? "none"}:${branch.sucursalId ?? "none"}:${index}`}
                              className="text-muted-foreground"
                            >
                              {branches.find(
                                (item) => item.id === branch.sucursalId,
                              )?.nombre ?? "Sucursal"}
                              : {branch.participacion.toFixed(2)} %
                            </p>
                          ))
                        ) : (
                          <p className="text-muted-foreground">
                            Sin detalle de sucursales.
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Meses</h4>
                        {premises?.meses?.length ? (
                          premises.meses.map((month, index) => (
                            <p
                              key={`${month.unidadNegocioId ?? "none"}:${month.mes}:${index}`}
                              className="text-muted-foreground"
                            >
                              {MONTHS[month.mes - 1] ?? month.mes}:{" "}
                              {month.participacion.toFixed(2)} %
                            </p>
                          ))
                        ) : (
                          <p className="text-muted-foreground">
                            Sin detalle mensual.
                          </p>
                        )}
                      </div>
                      {premises?.crecimientoAnualPct != null && (
                        <p className="text-muted-foreground md:col-span-3">
                          Crecimiento anual:{" "}
                          {premises.crecimientoAnualPct.toFixed(2)} %
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
              {versions.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No hay versiones guardadas para {year}.
                </p>
              )}
            </section>

            <div
              className="rounded-lg border border-dashed p-4 text-sm"
              role="note"
            >
              <h3 className="font-medium">Distribución por marca o premisa</h3>
              <p className="mt-1 text-muted-foreground">
                El mix de cada nivel se guarda ligado a su versión y al monto
                que reparte. Las versiones aprobadas antes de habilitar este
                detalle permanecen sin mix; no se reconstruyen como metas usando
                ventas históricas.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
