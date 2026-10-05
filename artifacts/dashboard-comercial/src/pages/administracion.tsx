import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canCreateDeleteUsers, canManageManualAdjustments, isFullAccessRole } from "@/lib/permissions";
import { createAjusteHttp, createUsuarioHttp, deleteAjusteHttp, deleteUsuarioHttp, getAjustesHttp, getUsuariosHttp, updateUsuarioHttp } from "@/lib/administracion-http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, ComboboxValue } from "@/components/ui/combobox";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { PageHeader } from "@/components/page-header";
import { useHealthCheck } from "@workspace/api-client-react";
import { Clock3, Database, ShieldCheck } from "lucide-react";

const ROLE_LABELS: Record<string, string> = { administrador: "Administrador", director: "Dirección", gerencia: "Gerencia nacional", gerente_comercial: "Gerencia comercial", coordinador: "Coordinador", asesor: "Asesor" };
function Denied({ admin = false }: { admin?: boolean }) { return <div className="ccv-admin-denied card-elevated max-w-xl p-8 text-center"><h2 className="font-display text-xl font-semibold">Acceso restringido</h2><p className="mt-2 text-sm text-muted-foreground">{admin ? "Esta superficie requiere Gerencia y administrador de la aplicación." : "Esta superficie requiere el rol Gerencia."}</p></div>; }
export function UsuariosPage() {
  const { role } = useAuth(); const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", nombreCompleto: "", role: "asesor", sucursalIds: [] as string[], unidadNegocioIds: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState("asesor");
  const [editScope, setEditScope] = useState({ sucursalIds: [] as string[], unidadNegocioIds: [] as string[] });
  const data = useQuery({ queryKey: ["usuarios"], queryFn: getUsuariosHttp });
  const { data: sucursales = [] } = useSucursales(); const { data: unidades = [] } = useUnidades();
  const create = useMutation({ mutationFn: () => createUsuarioHttp({ ...form, sucursalId: form.sucursalIds[0] ?? null, unidadNegocioId: form.unidadNegocioIds[0] ?? null }), onSuccess: () => { toast.success("Usuario creado"); setForm({ email: "", password: "", nombreCompleto: "", role: "asesor", sucursalIds: [], unidadNegocioIds: [] }); qc.invalidateQueries({ queryKey: ["usuarios"] }); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: deleteUsuarioHttp, onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }), onError: (e: Error) => toast.error(e.message) });
  const update = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateUsuarioHttp(id, data), onSuccess: () => { toast.success("Usuario actualizado"); setEditingId(null); qc.invalidateQueries({ queryKey: ["usuarios"] }); }, onError: (e: Error) => toast.error(e.message) });
  if (!isFullAccessRole(role)) return <Denied />;
  const roleFor = (userId: string) => data.data?.roles.find((r) => r.userId === userId)?.role ?? "asesor";
  const unitsFor = (userId: string) => data.data?.profileUnidades.filter((x) => x.profileId === userId).map((x) => x.unidadNegocioId) ?? [];
  const branchesFor = (userId: string) => data.data?.profileSucursales.filter((x) => x.profileId === userId).map((x) => x.sucursalId) ?? [];
  const startEdit = (userId: string) => {
    const profile = data.data?.profiles.find((x) => x.id === userId);
    setEditingId(userId);
    setEditingRole(roleFor(userId));
    setEditScope({ unidadNegocioIds: unitsFor(userId).length ? unitsFor(userId) : profile?.unidadNegocioId ? [profile.unidadNegocioId] : [], sucursalIds: branchesFor(userId).length ? branchesFor(userId) : profile?.sucursalId ? [profile.sucursalId] : [] });
  };
  const assignmentFields = (roleValue: string, values: { sucursalIds: string[]; unidadNegocioIds: string[] }, setValue: (key: "sucursalIds" | "unidadNegocioIds", selected: string[]) => void, idPrefix: string) => {
    const isUnitScope = roleValue === "gerente_comercial";
    if (!isUnitScope && roleValue !== "coordinador" && roleValue !== "asesor") return null;
    const key = isUnitScope ? "unidadNegocioIds" : "sucursalIds";
    const label = isUnitScope ? "Unidades asignadas" : "Sucursales asignadas";
    const items = isUnitScope ? unidades ?? [] : sucursales ?? [];
    const selected = values[key];
    const id = `${idPrefix}-${isUnitScope ? "unidades" : "sucursales"}`;
    return <div><Label htmlFor={id}>{label}</Label><Combobox multiple value={selected} onValueChange={(next) => setValue(key, next)} autoHighlight><ComboboxChips className="mt-1"><ComboboxValue>{(value: string[]) => value.map((itemId) => <ComboboxChip key={itemId}>{items.find((item) => item.id === itemId)?.nombre ?? "Asignación"}</ComboboxChip>)}</ComboboxValue><ComboboxChipsInput id={id} aria-label={label} placeholder={`Buscar ${isUnitScope ? "unidad" : "sucursal"}…`} /></ComboboxChips><ComboboxContent><ComboboxList>{items.map((item) => <ComboboxItem key={item.id} value={item.id}>{item.nombre}</ComboboxItem>)}</ComboboxList><ComboboxEmpty>No hay coincidencias.</ComboboxEmpty></ComboboxContent></Combobox><p className="mt-1 text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? "asignación seleccionada" : "asignaciones seleccionadas"}.</p></div>;
  };
  return <div className="ccv-admin-page ccv-users-page space-y-6"><PageHeader eyebrow="Administración · Accesos" title="Usuarios y permisos" description="Cuentas, roles y alcance de sucursales y unidades." />
    {data.isLoading && <p className="text-sm text-muted-foreground" role="status">Cargando usuarios…</p>}
    {data.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert"><p className="text-sm text-destructive">{data.error.message}</p><Button type="button" size="sm" variant="outline" onClick={() => void data.refetch()}>Reintentar</Button></div>}
    {canCreateDeleteUsers(role) && <section className="ccv-admin-form card-elevated space-y-3 p-5"><h3 className="font-semibold">Crear usuario</h3><div className="grid gap-3 md:grid-cols-4"><div><Label htmlFor="nuevo-nombre">Nombre completo</Label><Input id="nuevo-nombre" value={form.nombreCompleto} onChange={e => setForm({ ...form, nombreCompleto: e.target.value })} /></div><div><Label htmlFor="nuevo-correo">Correo</Label><Input id="nuevo-correo" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div><div><Label htmlFor="nueva-clave">Contraseña temporal (8+)</Label><Input id="nueva-clave" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div><div><Label htmlFor="nuevo-rol">Rol inicial</Label><select id="nuevo-rol" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{["administrador", "director", "gerencia", "gerente_comercial", "coordinador", "asesor"].map(x => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select></div></div><div className="grid gap-3 md:grid-cols-2">{assignmentFields(form.role, form, (key, value) => setForm(current => ({ ...current, [key]: value })), "nuevo")}</div><p className="text-xs text-muted-foreground">Gerencia Comercial necesita al menos una unidad; Coordinación y Asesoría, al menos una sucursal.</p><Button disabled={create.isPending} onClick={() => create.mutate()}>Crear usuario</Button></section>}
    <section className="ccv-admin-table card-elevated overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Nombre</th><th>Correo</th><th>Rol</th><th>Alcance asignado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{data.data?.users.map(u => { const p = data.data?.profiles.find(x => x.id === u.id); const userRole = roleFor(u.id); const userUnits = unitsFor(u.id); const userBranches = branchesFor(u.id); const canEditTarget = canCreateDeleteUsers(role) || userRole !== "administrador"; return <tr className="border-b align-top" key={u.id}><td className="p-3">{p?.nombreCompleto ?? "—"}</td><td>{u.email}</td><td>{editingId === u.id ? <select aria-label={`Rol de ${p?.nombreCompleto ?? u.email}`} className="rounded border bg-background p-1" value={editingRole} onChange={e => setEditingRole(e.target.value)}>{["administrador","director","gerencia","gerente_comercial","coordinador","asesor"].filter(x => canCreateDeleteUsers(role) || x !== "administrador").map(x => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select> : <span className="ccv-role-badge">{ROLE_LABELS[userRole] ?? userRole}</span>}</td><td className="min-w-52">{editingId === u.id ? <div className="space-y-2">{assignmentFields(editingRole, editScope, (key, value) => setEditScope(current => ({ ...current, [key]: value })), `editar-${u.id}`)}<div className="flex gap-2"><Button size="sm" onClick={() => update.mutate({ id: u.id, data: { role: editingRole, unidadNegocioIds: editScope.unidadNegocioIds, sucursalIds: editScope.sucursalIds } })}>Guardar cambios</Button><Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button></div></div> : <div className="space-y-2"><p className="text-xs text-muted-foreground">{userRole === "gerente_comercial" ? userUnits.map(id => unidades?.find(x => x.id === id)?.nombre ?? "Unidad").join(", ") || "Sin unidad" : ["asesor", "coordinador"].includes(userRole) ? userBranches.map(id => sucursales?.find(x => x.id === id)?.nombre ?? "Sucursal").join(", ") || "Sin sucursal" : "Global"}</p>{canEditTarget && <Button size="sm" variant="outline" onClick={() => startEdit(u.id)}>Editar rol y alcance</Button>}</div>}</td><td><span className={u.isActive ? "ccv-status-badge is-active" : "ccv-status-badge is-inactive"}>{u.isActive ? "Activo" : "Inactivo"}</span></td><td className="whitespace-nowrap">{canCreateDeleteUsers(role) && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: u.id, data: { isActive: !u.isActive } })}>{u.isActive ? "Desactivar" : "Activar"}</Button>}{canCreateDeleteUsers(role) && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`¿Eliminar a ${p?.nombreCompleto ?? u.email}? Esta acción no se puede deshacer.`)) remove.mutate(u.id); }}>Eliminar</Button>}</td></tr>; })}</tbody></table></section></div>;
}
export function AjustesPage() {
  const { role, profile } = useAuth(); const qc = useQueryClient(); const year = new Date().getFullYear(); const [form, setForm] = useState({ mes: String(new Date().getMonth() + 1), columna: "total", monto: "", motivo: "", sucursalId: "", unidadNegocioId: "" });
  const { data: sucursales = [] } = useSucursales(); const { data: unidades = [] } = useUnidades();
  const canManageAdjustments = canManageManualAdjustments(role, profile?.is_admin);
  const data = useQuery({ queryKey: ["ajustes", year], queryFn: () => getAjustesHttp(year), enabled: canManageAdjustments }); const create = useMutation({ mutationFn: () => createAjusteHttp({ anio: year, mes: Number(form.mes), columna: form.columna, monto: Number(form.monto), motivo: form.motivo, sucursalId: form.sucursalId || null, unidadNegocioId: form.unidadNegocioId || null }), onSuccess: () => { toast.success("Ajuste registrado"); setForm(current => ({ ...current, monto: "", motivo: "" })); qc.invalidateQueries({ queryKey: ["ajustes"] }); }, onError: (e: Error) => toast.error(e.message) }); const del = useMutation({ mutationFn: deleteAjusteHttp, onSuccess: () => { toast.success("Ajuste eliminado"); qc.invalidateQueries({ queryKey: ["ajustes"] }); }, onError: (e: Error) => toast.error(e.message) });
  if (!canManageAdjustments) return <Denied admin />;
  const selectedBranch = sucursales.find(item => item.id === form.sucursalId)?.nombre ?? "Todas las sucursales";
  const selectedUnit = unidades.find(item => item.id === form.unidadNegocioId)?.nombre ?? "Todas las unidades";
  const effectiveColumn = form.columna === "total" ? "CCV (columna Total)" : form.columna;
  return <div className="ccv-admin-page ccv-adjustments-page space-y-6"><PageHeader eyebrow="Administración · Control" title="Ajustes manuales" description="Registra correcciones con motivo y alcance auditables." />{data.isLoading && <p className="text-sm text-muted-foreground" role="status">Cargando ajustes…</p>}{data.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert"><p className="text-sm text-destructive">{data.error.message}</p><Button type="button" size="sm" variant="outline" onClick={() => void data.refetch()}>Reintentar</Button></div>}<section className="ccv-admin-form ccv-adjustment-form card-elevated space-y-3 p-5"><div className="grid gap-3 md:grid-cols-4"><div><Label htmlFor="ajuste-mes">Mes</Label><Input id="ajuste-mes" type="number" min="1" max="12" value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} /></div><div><Label htmlFor="ajuste-columna">Columna</Label><select id="ajuste-columna" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.columna} onChange={e => setForm({ ...form, columna: e.target.value })}><option value="total">Total (se suma a CCV)</option><option value="ccv">CCV</option><option value="xibi">Xibi</option><option value="estrategico">Estratégico / Otra Empresa</option></select></div><div><Label htmlFor="ajuste-sucursal">Sucursal</Label><select id="ajuste-sucursal" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.sucursalId} onChange={e => setForm({ ...form, sucursalId: e.target.value })}><option value="">Todas las sucursales</option>{sucursales.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div><div><Label htmlFor="ajuste-unidad">Unidad</Label><select id="ajuste-unidad" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.unidadNegocioId} onChange={e => setForm({ ...form, unidadNegocioId: e.target.value })}><option value="">Todas las unidades</option>{unidades.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div><Input aria-label="Monto del ajuste" type="number" placeholder="Monto" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} /><Input aria-label="Motivo obligatorio del ajuste" placeholder="Motivo obligatorio" value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} /><Button className="md:col-span-2" disabled={create.isPending || !form.motivo.trim() || !form.monto || Number(form.mes) < 1 || Number(form.mes) > 12} onClick={() => { if (window.confirm(`Registrar ${Number(form.monto).toLocaleString()} en ${effectiveColumn} para ${form.mes}/${year}, ${selectedBranch} · ${selectedUnit}?`)) create.mutate(); }}>{create.isPending ? "Registrando…" : "Registrar ajuste"}</Button></div><div className="ccv-adjustment-preview" aria-live="polite"><span>Vista previa del alcance</span><strong>{Number(form.monto || 0).toLocaleString()} · {effectiveColumn}</strong><p>{form.mes}/{year} · {selectedBranch} · {selectedUnit}</p><small>El ajuste se aplicará a las filas que coincidan. “Todas” funciona como comodín para esa dimensión.</small></div></section><section className="ccv-admin-table card-elevated overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Mes</th><th>Columna</th><th>Monto</th><th>Motivo</th><th>Alcance</th><th /></tr></thead><tbody>{data.data?.map(a => <tr className="border-b" key={a.id}><td className="p-3">{a.mes}/{a.anio}</td><td className="capitalize">{a.columna ?? "total"}</td><td>{Number(a.monto).toLocaleString()}</td><td>{a.motivo}</td><td>{a.sucursal} / {a.unidad}</td><td><Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => { if (window.confirm(`¿Eliminar el ajuste de ${a.mes}/${a.anio} por ${Number(a.monto).toLocaleString()}? El registro dejará de aplicarse al cálculo.`)) del.mutate(a.id); }}>Eliminar</Button></td></tr>)}</tbody></table></section></div>;
}
export function CargaPage() {
  const { role } = useAuth();
  const health = useHealthCheck({ query: { queryKey: ["/api/healthz", "fuentes"], refetchInterval: 30_000 } });
  if (!isFullAccessRole(role)) return <Denied />;

  const apiOnline = health.data?.status === "ok";
  return (
    <div className="ccv-admin-page ccv-data-sources-page space-y-6">
      <PageHeader
        eyebrow="Administración · Datos"
        title="Fuentes comerciales"
        description="El dashboard consulta PostgreSQL como fuente operativa. La importación de archivos no está disponible."
      />
      <section className="grid gap-4 md:grid-cols-2">
        <article className="card-elevated flex min-h-52 flex-col justify-between p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Origen principal</p>
              <h2 className="mt-3 font-display text-2xl font-medium">PostgreSQL</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Ventas, presupuestos, sucursales y permisos se consultan desde la base operativa.</p>
            </div>
            <span className="rounded-lg bg-primary/10 p-3 text-primary"><Database aria-hidden="true" /></span>
          </div>
          <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm">
            <span className={`size-2 rounded-full ${apiOnline ? "bg-emerald-600" : health.isLoading ? "bg-amber-500" : "bg-destructive"}`} />
            <span className="font-medium">{apiOnline ? "API operativa" : health.isLoading ? "Verificando conexión…" : "API no disponible"}</span>
            <span className="ml-auto text-xs text-muted-foreground">No mide frescura de datos</span>
          </div>
        </article>
        <article className="card-elevated flex min-h-52 flex-col justify-between p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Frescura de datos</p>
              <h2 className="mt-3 font-display text-2xl font-medium">Sin marca de tiempo</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">El backend no publica cuándo se actualizó cada fuente. Los módulos consultan la base PostgreSQL directamente.</p>
            </div>
            <span className="rounded-lg bg-amber-500/10 p-3 text-amber-700"><Clock3 aria-hidden="true" /></span>
          </div>
          <div className="mt-6 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>Para corregir información, solicita el ajuste al administrador. Los permisos de cada rol siguen aplicándose en el servidor.</span>
          </div>
        </article>
      </section>
    </div>
  );
}
