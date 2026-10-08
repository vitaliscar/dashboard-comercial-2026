import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { QueryErrorNotice } from "@/components/query-error-notice";

type Scope = { nivel: string; unidadId: string; unidad: string; sucursalId: string; sucursal: string; mes: number; asesorId: string; asesor: string; monto: number; sugerencias?: Array<{ itemKey: string; participacion: number }> };
type RecordRow = { nivel: string; unidadId: string; sucursalId: string | null; mes: number | null; asesorId: string | null; itemKey: string; participacion: number; monto: number };
type MixData = { anio: number; versionId: string | null; estado: string | null; scopes: Scope[]; records: RecordRow[]; editableLevels: string[] };
type Item = { key: string; label: string };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function catalog(unit: string): Item[] {
  const name = unit.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (name.includes("repuesto")) return [{ key: "caterpillar", label: "Caterpillar" }, { key: "blumaq", label: "Blumaq" }, { key: "otros", label: "Otros" }];
  if (name.includes("lub") || name.includes("filtro")) return [{ key: "chronus", label: "Chronus · Lubricantes" }, { key: "donaldson", label: "Donaldson · Filtros" }];
  if (name.includes("servicio")) return [{ key: "csa", label: "CSA" }, { key: "otras", label: "Otras" }];
  if (name.includes("equipo")) return [{ key: "generac", label: "Generac" }, { key: "weichai", label: "Weichai" }, { key: "ep_equipment", label: "EP Equipment" }, { key: "otras", label: "Otras" }];
  if (name.includes("alquiler")) return [{ key: "comercial", label: "Comercial" }, { key: "industrial", label: "Industrial" }, { key: "residencial", label: "Residencial" }];
  return [];
}
function scopeKey(scope: Scope) { return [scope.nivel, scope.unidadId, scope.sucursalId, scope.mes, scope.asesorId].join(":"); }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? "No se pudo completar la operación."); }
  return response.json() as Promise<T>;
}

export function BudgetMixEditor({ year, versions = [] }: { year: number; versions?: Array<{ id: string; nombre: string; estado: string }> }) {
  const client = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const query = useQuery({ queryKey: ["presupuestos", "mix", year, selectedVersionId], queryFn: () => request<MixData>(`/api/presupuestos/mix?anio=${year}${selectedVersionId ? `&versionId=${encodeURIComponent(selectedVersionId)}` : ""}`) });
  const data = query.data;
  const editableLevels = data?.editableLevels ?? [];
  const levels = [...new Set([...editableLevels, ...(data?.scopes ?? []).map(scope => scope.nivel)])];
  const [level, setLevel] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const canEdit = editableLevels.includes(level);
  const scopes = useMemo(() => (data?.scopes ?? []).filter(scope => scope.nivel === level), [data?.scopes, level]);
  const selected = scopes.find(scope => scopeKey(scope) === selectedKey) ?? scopes[0];
  const items = catalog(selected?.unidad ?? "");
  const saved = (data?.records ?? []).filter(row => row.nivel === selected?.nivel && row.unidadId === selected?.unidadId && (row.sucursalId ?? "") === selected?.sucursalId && Number(row.mes ?? 0) === selected?.mes && (row.asesorId ?? "") === selected?.asesorId);
  useEffect(() => { if (levels.length && !levels.includes(level)) setLevel(levels[0]!); }, [levels, level]);
  useEffect(() => { if (selected && !scopes.some(scope => scopeKey(scope) === selectedKey)) setSelectedKey(scopeKey(selected)); }, [selected, selectedKey, scopes]);
  useEffect(() => {
    if (!selected) return;
    const next: Record<string, number> = {};
    let allocated = 0;
    items.forEach((item, index) => {
      const stored = saved.find(row => row.itemKey === item.key)?.participacion ?? selected.sugerencias?.find(row => row.itemKey === item.key)?.participacion;
      const share = stored == null ? (index === items.length - 1 ? 100 - allocated : Math.floor((100 / items.length) * 100) / 100) : Number(stored);
      next[item.key] = share;
      allocated += share;
    });
    setDraft(next);
  }, [selectedKey, data?.records, selected?.unidad, items.length]);
  const totalShare = items.reduce((sum, item) => sum + Number(draft[item.key] ?? 0), 0);
  const amount = items.reduce((sum, item) => sum + Number(selected?.monto ?? 0) * Number(draft[item.key] ?? 0) / 100, 0);
  const mutation = useMutation({
    mutationFn: () => request("/api/presupuestos/mix", { method: "PUT", body: JSON.stringify({ versionId: data?.versionId, nivel: level, unidadId: selected?.unidadId, sucursalId: selected?.sucursalId || null, mes: selected?.mes || null, asesorId: selected?.asesorId || null, items: items.map(item => ({ key: item.key, participacion: Number(draft[item.key] ?? 0) })) }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["presupuestos", "mix", year] }); },
  });
  return <Card>
    <CardHeader><CardTitle>Presupuesto por marca o premisa</CardTitle><p className="text-sm text-muted-foreground">Reparte cada monto padre entre las categorías de su unidad. Cada asignación debe sumar 100 % y se guarda ligada a la versión {data?.estado ?? ""}.</p></CardHeader>
    <CardContent className="space-y-4">
      {query.isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando distribución del mix…</p>}
      {query.isError && <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} fallback="No se pudo cargar el mix de presupuesto." />}
      {data && !data.versionId && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay una versión de presupuesto guardada para {year}. Genera una propuesta para habilitar el reparto.</p>}
      {data?.versionId && !levels.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay asignaciones disponibles para esta versión.</p>}
      {data?.versionId && levels.length > 0 && <>
        {versions.length > 0 && <label className="block max-w-xl text-sm"><span className="mb-1 block text-muted-foreground">Versión del presupuesto</span><select value={selectedVersionId || data.versionId} onChange={event => { setSelectedVersionId(event.target.value); setSelectedKey(""); }} className="h-10 w-full rounded-lg border border-input bg-background px-3">{versions.map(version => <option key={version.id} value={version.id}>{version.nombre} · {version.estado}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-muted-foreground">Nivel de reparto</span><select value={level} onChange={event => { setLevel(event.target.value); setSelectedKey(""); }} className="h-10 w-full rounded-lg border border-input bg-background px-3">{levels.map(value => <option key={value} value={value}>{value === "unidad" ? `Unidad de negocio${editableLevels.includes(value) ? " · editable" : " · lectura"}` : value === "sucursal_mes" ? `Sucursal y mes${editableLevels.includes(value) ? " · editable" : " · lectura"}` : `Asesor, mes y marca${editableLevels.includes(value) ? " · editable" : " · lectura"}`}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block text-muted-foreground">Monto a distribuir</span><select value={selected ? scopeKey(selected) : ""} onChange={event => setSelectedKey(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3">{scopes.map(scope => <option key={scopeKey(scope)} value={scopeKey(scope)}>{scope.unidad}{scope.nivel !== "unidad" ? ` · ${scope.sucursal} · ${MONTHS[scope.mes - 1]}` : ""}{scope.asesor ? ` · ${scope.asesor}` : ""} — ${money(scope.monto)}</option>)}</select></label>
        </div>
        {!selected && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay montos disponibles para este nivel. En Coordinación, primero completa la distribución del presupuesto entre asesores.</p>}
        {selected && items.length > 0 && (canEdit || saved.length > 0) && <>
          <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="p-3">Marca o premisa</th><th className="p-3 text-right">Participación</th><th className="p-3 text-right">Monto asignado</th></tr></thead><tbody>{items.map(item => <tr key={item.key} className="border-b last:border-0"><td className="p-3 font-medium">{item.label}</td><td className="p-3 text-right"><div className="inline-flex items-center gap-2"><input aria-label={`Participación ${item.label}`} type="number" min="0" max="100" step="0.01" value={draft[item.key] ?? ""} disabled={!canEdit} onChange={event => setDraft(previous => ({ ...previous, [item.key]: Number(event.target.value) }))} className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right tabular-nums disabled:opacity-70" /><span>%</span></div></td><td className="p-3 text-right tabular-nums">{money(Number(selected.monto) * Number(draft[item.key] ?? 0) / 100)}</td></tr>)}</tbody><tfoot><tr className="font-semibold"><td className="p-3">Total</td><td className="p-3 text-right tabular-nums">{totalShare.toFixed(2)} %</td><td className="p-3 text-right tabular-nums">{money(amount)}</td></tr></tfoot></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Base: {money(selected.monto)} · {saved.length ? "Mix guardado" : selected.sugerencias?.length ? "Referencia calculada con ventas disponibles" : "Sin ventas clasificables; se propone un reparto inicial equilibrado"}. La referencia no modifica el monto padre.</p>{canEdit && <Button disabled={mutation.isPending || Math.abs(totalShare - 100) > 0.00001 || !data.versionId} onClick={() => mutation.mutate()}>{mutation.isPending ? "Guardando…" : "Guardar mix"}</Button>}</div>
          {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          {mutation.isSuccess && <p role="status" className="text-sm text-success">Mix guardado. La suma coincide con el monto padre.</p>}
        </>}
        {selected && items.length > 0 && !canEdit && !saved.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Este nivel aún no tiene mix guardado en esta versión. Las ventas disponibles no se muestran como metas.</p>}
      </>}
    </CardContent>
  </Card>;
}
