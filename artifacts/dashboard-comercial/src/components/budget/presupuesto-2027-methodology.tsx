import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { budgetMoney as money } from "@/components/budget/format";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Premise = { unidadNegocioId: string; unidad: string; gTendenciaOverride: number | null; pctDirectorio: number; pctGestion: number; incrementalUsd: number };
type Config = { mesCierre: number; topeAtipico: number; pesosAnio: Record<"2024" | "2025" | "2026", number>; pesosTendencia: { g25: number; g26: number }; premisas: Premise[] };
type Summary = { unidadNegocioId: string; unidad: string; real2024: number; real2025: number; real2026Ytd: number; proyeccion2026: number; backtestMesCorte: number; backtest2025Proyeccion: number | null; backtest2025ErrorPct: number | null; g25: number; g26: number; gTendencia: number; gUsada: number; base2027: number; conDirectorio: number; conGestion: number; ppto2027: number; indiceEstacional: number[] };
type Detail = { unidadNegocioId: string; unidad: string; sucursalId: string | null; sucursal: string; canal: string; mes: number; peso: number; ie: number; historico2026: number; monto: number };
type Version = { id: string; nombre: string; estado: string; createdAt: string; aprobadoAt: string | null; total2027: string | number | null };
type Data = { config: Config; calculation: { summary: Summary[]; detail: Detail[]; monthTotals: Array<{ mes: number; monto: number }>; total2027: number }; versions: Version[] };

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CHANNELS: Record<string, string> = { ccv: "CCV", xibi: "Xibi", estrategicas: "Estratégicas" };
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const backtestError = (value: number | null) => value === null
  ? "Sin base"
  : Math.abs(value) < 0.0005 ? "0.0% · sin desvío"
  : `${value >= 0 ? "+" : ""}${pct(value)} · ${value >= 0 ? "sobreestima" : "subestima"}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "No se pudo completar la operación.");
  }
  return response.json();
}

export function Presupuesto2027Methodology() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedUnit, setSelectedUnit] = useState("todas");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const query = useQuery<Data>({ queryKey: ["presupuestos", "metodologia-2027"], queryFn: () => request("/presupuestos/2027") });
  useEffect(() => { if (query.data?.config) setConfig(query.data.config); }, [query.data?.config]);

  const editableDirectory = role === "administrador" || role === "director";
  const editableManagement = role === "administrador" || role === "gerencia";
  const editableSettings = role === "administrador";
  const canEdit = editableDirectory || editableManagement || editableSettings;
  const canGenerate = role === "administrador" || role === "director" || role === "gerencia";
  const canApprove = role === "administrador" || role === "director" || role === "gerencia";
  const summary = query.data?.calculation.summary ?? [];
  const visibleSummary = useMemo(() => selectedUnit === "todas" ? summary : summary.filter((row) => row.unidadNegocioId === selectedUnit), [selectedUnit, summary]);
  const visibleDetails = useMemo(() => (query.data?.calculation.detail ?? []).filter((row) => selectedUnit === "todas" || row.unidadNegocioId === selectedUnit), [query.data?.calculation.detail, selectedUnit]);
  const selectedProposal = query.data?.versions.find((version) => version.estado === "propuesto");
  const configDirty = Boolean(config && query.data?.config && JSON.stringify(config) !== JSON.stringify(query.data.config));

  const save = useMutation({
    mutationFn: () => request<Data>("/presupuestos/2027/premisas", { method: "PUT", body: JSON.stringify({ config }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "metodologia-2027"] }),
  });
  const generate = useMutation({
    mutationFn: () => request<{ id: string }>("/presupuestos/2027/generar", { method: "POST", body: "{}" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "metodologia-2027"] }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => request(`/presupuestos/versiones/${id}/aprobar`, { method: "POST", body: "{}" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["presupuestos", "metodologia-2027"] }); await queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", 2027] }); },
  });

  const updatePremise = (id: string, key: keyof Premise, value: number | null) => setConfig((current) => current ? ({ ...current, premisas: current.premisas.map((row) => row.unidadNegocioId === id ? { ...row, [key]: value } : row) }) : current);
  const updateSetting = (key: "mesCierre" | "topeAtipico", value: number) => setConfig((current) => current ? { ...current, [key]: value } : current);
  const updateYearWeight = (year: "2024" | "2025" | "2026", value: number) => setConfig((current) => current ? { ...current, pesosAnio: { ...current.pesosAnio, [year]: value } } : current);
  const updateTrendWeight = (key: "g25" | "g26", value: number) => setConfig((current) => current ? { ...current, pesosTendencia: { ...current.pesosTendencia, [key]: value } } : current);

  if (query.isLoading) return <Card><CardContent className="p-5 text-sm text-muted-foreground" role="status">Cargando metodología 2027…</CardContent></Card>;
  return (
    <section className="space-y-4" aria-labelledby="budget-2027-title">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Planeación plurianual</p><CardTitle id="budget-2027-title" className="mt-1">Presupuesto 2027</CardTitle><p className="mt-1 text-sm text-muted-foreground">Base proyectada 2026 × Directorio × Gestión + portafolio incremental, repartido por canal y estacionalidad.</p></div>
          <div className="flex flex-wrap gap-2">{canEdit && <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending || !config || !configDirty}>{save.isPending ? "Guardando…" : "Guardar y recalcular"}</Button>}{canGenerate && <Button onClick={() => generate.mutate()} disabled={generate.isPending || !query.data?.versions.some((version) => version.estado === "borrador")}>{generate.isPending ? "Generando…" : "Generar propuesta"}</Button>}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isError && <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo calcular el presupuesto 2027." />}
          {configDirty && <p className="text-sm text-muted-foreground" role="status">Hay premisas sin guardar. Guarda y recalcula para actualizar los montos.</p>}
          {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}{generate.isError && <p role="alert" className="text-sm text-destructive">{generate.error.message}</p>}
          {save.isSuccess && !configDirty && <p role="status" className="text-sm text-primary">Premisas guardadas como borrador.</p>}
          {summary.length === 0 && !query.isError && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">El histórico no contiene unidades con ventas para proyectar en 2027.</p>}
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cierre 2026 proyectado</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(summary.reduce((sum, row) => sum + row.proyeccion2026, 0))}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Presupuesto 2027 propuesto</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(query.data?.calculation.total2027 ?? 0)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Meses completos de 2026</p><p className="mt-1 text-xl font-semibold tabular-nums">{config?.mesCierre ?? 9} de 12</p></div></div>
          {summary.length > 0 && <section className="rounded-lg border border-border" aria-labelledby="budget-2027-backtest">
            <div className="border-b border-border px-4 py-3"><h3 id="budget-2027-backtest" className="font-semibold">Precisión de la proyección</h3><p className="mt-1 text-xs text-muted-foreground">Simulación: proyectar el cierre 2025 con sus ventas hasta {MONTHS[(summary[0]?.backtestMesCorte ?? 9) - 1]} y la estacionalidad de 2024. El desvío mide la diferencia frente al cierre real de 2025.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Error histórico del método de proyección por unidad</caption><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th scope="col" className="px-4 py-2">Unidad</th><th scope="col" className="px-4 py-2 text-right">Estimado 2025</th><th scope="col" className="px-4 py-2 text-right">Real 2025</th><th scope="col" className="px-4 py-2 text-right">Desvío</th></tr></thead><tbody>{visibleSummary.map((row) => <tr key={row.unidadNegocioId} className="border-t border-border/70"><th scope="row" className="px-4 py-2 text-left font-medium">{row.unidad}</th><td className="px-4 py-2 text-right tabular-nums">{row.backtest2025Proyeccion === null ? "—" : money(row.backtest2025Proyeccion)}</td><td className="px-4 py-2 text-right tabular-nums">{money(row.real2025)}</td><td className={`px-4 py-2 text-right tabular-nums ${row.backtest2025ErrorPct !== null && Math.abs(row.backtest2025ErrorPct) > 0.1 ? "font-semibold text-destructive" : "text-foreground"}`}>{backtestError(row.backtest2025ErrorPct)}</td></tr>)}</tbody></table></div>
          </section>}
          {editableSettings && config && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Parámetros de cálculo</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-muted-foreground">Último mes cerrado<Input type="number" min={1} max={12} value={config.mesCierre} onChange={(event) => updateSetting("mesCierre", Number(event.target.value))} /></label><label className="text-xs text-muted-foreground">Tope atípico × mediana<Input type="number" min={0.1} step={0.1} value={config.topeAtipico} onChange={(event) => updateSetting("topeAtipico", Number(event.target.value))} /></label>{(["2024", "2025", "2026"] as const).map((year) => <label key={year} className="text-xs text-muted-foreground">Peso de reparto {year} · %<Input type="number" min={0} max={100} step={0.1} value={config.pesosAnio[year] * 100} onChange={(event) => updateYearWeight(year, Number(event.target.value) / 100)} /></label>)}<label className="text-xs text-muted-foreground">Peso tendencia 2025 · %<Input type="number" min={0} max={100} step={0.1} value={config.pesosTendencia.g25 * 100} onChange={(event) => updateTrendWeight("g25", Number(event.target.value) / 100)} /></label><label className="text-xs text-muted-foreground">Peso tendencia 2026 · %<Input type="number" min={0} max={100} step={0.1} value={config.pesosTendencia.g26 * 100} onChange={(event) => updateTrendWeight("g26", Number(event.target.value) / 100)} /></label></div><p className="mt-2 text-xs text-muted-foreground">Los pesos anuales y de tendencia deben sumar 100 % en cada grupo.</p></details>}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1660px] text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Unidad</th><th className="p-2 text-right">Real 2024</th><th className="p-2 text-right">Real 2025</th><th className="p-2 text-right">Real 2026 ene–{MONTHS[(config?.mesCierre ?? 9) - 1]}</th><th className="p-2 text-right">Proy. 2026</th><th className="p-2 text-right">g25</th><th className="p-2 text-right">g26</th><th className="p-2 text-right">Tendencia ref.</th><th className="p-2 text-right">Override %</th><th className="p-2 text-right">Directorio %</th><th className="p-2 text-right">Base 2027</th><th className="p-2 text-right">Con Directorio</th><th className="p-2 text-right">Gestión %</th><th className="p-2 text-right">Con Gestión</th><th className="p-2 text-right">Incremental USD</th><th className="p-2 text-right">Meta 2027</th></tr></thead>
              <tbody>{visibleSummary.map((row) => { const premise = config?.premisas.find((item) => item.unidadNegocioId === row.unidadNegocioId); return <tr key={row.unidadNegocioId} className="border-b last:border-0"><th scope="row" className="p-2 text-left font-medium">{row.unidad}</th><td className="p-2 text-right tabular-nums">{money(row.real2024)}</td><td className="p-2 text-right tabular-nums">{money(row.real2025)}</td><td className="p-2 text-right tabular-nums">{money(row.real2026Ytd)}</td><td className="p-2 text-right tabular-nums">{money(row.proyeccion2026)}</td><td className="p-2 text-right tabular-nums">{pct(row.g25)}</td><td className="p-2 text-right tabular-nums">{pct(row.g26)}</td><td className="p-2 text-right tabular-nums">{pct(row.gTendencia)}</td><td className="p-2 text-right">{editableDirectory && premise ? <Input aria-label={`Tendencia opcional ${row.unidad}`} className="ml-auto w-24 text-right" type="number" step="0.1" placeholder="0 %" value={premise.gTendenciaOverride === null ? "" : premise.gTendenciaOverride * 100} onChange={(event) => updatePremise(row.unidadNegocioId, "gTendenciaOverride", event.target.value === "" ? null : Number(event.target.value) / 100)} /> : pct(row.gUsada)}</td><td className="p-2 text-right">{editableDirectory && premise ? <Input aria-label={`Porcentaje Directorio ${row.unidad}`} className="ml-auto w-24 text-right" type="number" step="0.1" value={premise.pctDirectorio * 100} onChange={(event) => updatePremise(row.unidadNegocioId, "pctDirectorio", Number(event.target.value) / 100)} /> : pct(premise?.pctDirectorio ?? 0)}</td><td className="p-2 text-right tabular-nums">{money(row.base2027)}</td><td className="p-2 text-right tabular-nums">{money(row.conDirectorio)}</td><td className="p-2 text-right">{editableManagement && premise ? <Input aria-label={`Porcentaje Gestión ${row.unidad}`} className="ml-auto w-24 text-right" type="number" step="0.1" value={premise.pctGestion * 100} onChange={(event) => updatePremise(row.unidadNegocioId, "pctGestion", Number(event.target.value) / 100)} /> : pct(premise?.pctGestion ?? 0)}</td><td className="p-2 text-right tabular-nums">{money(row.conGestion)}</td><td className="p-2 text-right">{editableManagement && premise ? <Input aria-label={`Incremental USD ${row.unidad}`} className="ml-auto w-32 text-right" type="number" step="1000" value={premise.incrementalUsd} onChange={(event) => updatePremise(row.unidadNegocioId, "incrementalUsd", Number(event.target.value))} /> : money(premise?.incrementalUsd ?? 0)}</td><td className="p-2 text-right font-semibold tabular-nums">{money(row.ppto2027)}</td></tr>; })}</tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">Unidad</th>{MONTHS.map((month) => <th key={month} className="p-2 text-right">{month}</th>)}<th className="p-2 text-right">Total</th></tr></thead><tbody>{visibleSummary.map((row) => <tr key={row.unidadNegocioId} className="border-b"><th className="p-2 text-left font-medium">{row.unidad}</th>{MONTHS.map((_, index) => <td key={index} className="p-2 text-right tabular-nums">{money(visibleDetails.filter((line) => line.unidadNegocioId === row.unidadNegocioId && line.mes === index + 1).reduce((sum, line) => sum + line.monto, 0))}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{money(row.ppto2027)}</td></tr>)}<tr className="font-semibold"><th className="p-2 text-left">Total</th>{MONTHS.map((_, index) => <td key={index} className="p-2 text-right tabular-nums">{money(visibleDetails.filter((line) => line.mes === index + 1).reduce((sum, line) => sum + line.monto, 0))}</td>)}<td className="p-2 text-right tabular-nums">{money(visibleSummary.reduce((sum, row) => sum + row.ppto2027, 0))}</td></tr></tbody></table></div>
          <details className="rounded-lg border"><summary className="cursor-pointer p-3 text-sm font-medium">Índice estacional por unidad y mes</summary><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Unidad</th>{MONTHS.map((month) => <th key={month} className="p-2 text-right">{month}</th>)}<th className="p-2 text-right">Suma</th></tr></thead><tbody>{visibleSummary.map((row) => <tr key={row.unidadNegocioId} className="border-b"><th className="p-2 text-left font-medium">{row.unidad}</th>{row.indiceEstacional.map((index, month) => <td key={month} className="p-2 text-right tabular-nums">{index.toFixed(3)}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{row.indiceEstacional.reduce((sum, index) => sum + index, 0).toFixed(3)}</td></tr>)}</tbody></table></div></details>
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="budget-2027-unit" className="text-sm text-muted-foreground">Filtrar detalle</label><select id="budget-2027-unit" value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="todas">Todas las unidades</option>{summary.map((row) => <option key={row.unidadNegocioId} value={row.unidadNegocioId}>{row.unidad}</option>)}</select></div>
          <details className="rounded-lg border"><summary className="cursor-pointer p-3 text-sm font-medium">Detalle histórico por sucursal, canal y mes · {visibleDetails.length} líneas</summary><div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[820px] text-sm"><thead className="sticky top-0 bg-background"><tr className="border-b text-left"><th className="p-2">Unidad</th><th className="p-2">Sucursal</th><th className="p-2">Canal</th><th className="p-2">Mes</th><th className="p-2 text-right">Venta 2026</th><th className="p-2 text-right">Peso</th><th className="p-2 text-right">IE</th><th className="p-2 text-right">Presupuesto 2027</th></tr></thead><tbody>{visibleDetails.map((row, index) => <tr key={`${row.unidadNegocioId}:${row.sucursalId}:${row.canal}:${row.mes}:${index}`} className="border-b"><td className="p-2">{row.unidad}</td><td className="p-2">{row.sucursal}</td><td className="p-2">{CHANNELS[row.canal] ?? row.canal}</td><td className="p-2">{MONTHS[row.mes - 1]}</td><td className="p-2 text-right tabular-nums">{money(row.historico2026)}</td><td className="p-2 text-right tabular-nums">{pct(row.peso)}</td><td className="p-2 text-right tabular-nums">{row.ie.toFixed(3)}</td><td className="p-2 text-right tabular-nums">{money(row.monto)}</td></tr>)}</tbody></table></div></details>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">Versiones del presupuesto 2027</p><p className="text-xs text-muted-foreground">La propuesta no cambia la meta vigente hasta su aprobación.</p></div>{selectedProposal && canApprove && <Button size="sm" onClick={() => setApprovalOpen(true)} disabled={approve.isPending}>{approve.isPending ? "Aprobando…" : "Aprobar propuesta"}</Button>}</div>
          {approve.isError && <p role="alert" className="text-sm text-destructive">{approve.error.message}</p>}
          <div className="space-y-2">{(query.data?.versions ?? []).map((version) => <div key={version.id} className="flex flex-wrap justify-between gap-2 rounded-md border px-3 py-2 text-sm"><span>{version.nombre}</span><span className="text-muted-foreground">{version.estado} · {version.total2027 ? money(Number(version.total2027)) : "Borrador"} · {new Date(version.createdAt).toLocaleDateString("es-VE")}</span></div>)}{query.data?.versions.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Aún no hay versiones guardadas. Guarda las premisas para crear el borrador inicial.</p>}</div>
        </CardContent>
      </Card>
      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Aprobar el presupuesto 2027?</AlertDialogTitle><AlertDialogDescription>{selectedProposal ? `${money(Number(selectedProposal.total2027 ?? query.data?.calculation.total2027 ?? 0))} se aplicará como meta oficial por sucursal y mes. La aprobación anterior de 2027 quedará archivada.` : "La propuesta ya no está disponible."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={approve.isPending}>Revisar después</AlertDialogCancel><AlertDialogAction disabled={!selectedProposal || approve.isPending} onClick={(event) => { event.preventDefault(); if (selectedProposal) approve.mutate(selectedProposal.id, { onSuccess: () => setApprovalOpen(false) }); }}>{approve.isPending ? "Aprobando…" : "Confirmar aprobación"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>
  );
}
