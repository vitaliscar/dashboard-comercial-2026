"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getUsuariosDataAction,
  setUserRoleAction,
  setProfileSucursalAction,
  setProfileAdminAction,
  toggleProfileUnidadAction,
  toggleProfileSucursalAction,
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  deleteUserAction,
} from "@/lib/actions/usuarios";
import { roleLabel } from "@/lib/format";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Users,
  Shield,
  Plus,
  Search,
  KeyRound,
  Trash2,
  UserCog,
  Mail,
  Building2,
  Layers,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Power,
  Edit3,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/status-pill";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { RolePermissionsPanel } from "@/components/usuarios/RolePermissionsPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLES: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];

const ROLE_COLORS: Record<AppRole, string> = {
  gerencia: "bg-primary/10 text-primary border-primary/20",
  gerente_comercial: "bg-accent/10 text-accent border-accent/20",
  coordinador: "bg-warning/10 text-warning border-warning/20",
  asesor: "bg-success/10 text-success border-success/20",
};

type ProfileRow = {
  id: string;
  email: string | null;
  nombreCompleto: string | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  isAdmin: boolean;
  isActive?: boolean;
};

// ─── Initials avatar ─────────────────────────────────────────────────────────

function Avatar({
  name,
  email,
  isActive,
}: {
  name?: string | null;
  email?: string | null;
  isActive?: boolean;
}) {
  const text = name?.trim() || email?.trim() || "?";
  const initials = text
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const colors = [
    "from-primary to-primary/70",
    "from-accent to-accent/70",
    "from-warning to-warning/70",
    "from-success to-success/70",
    "from-destructive/90 to-destructive/70",
    "from-foreground/50 to-foreground/35",
  ];
  const color = colors[(text.charCodeAt(0) ?? 0) % colors.length];

  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "size-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg select-none",
          color,
          !isActive && "opacity-40 grayscale",
        )}
      >
        {initials}
      </div>
      {isActive !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card",
            isActive ? "bg-emerald-500" : "bg-slate-400",
          )}
        />
      )}
    </div>
  );
}

// ─── User Card ────────────────────────────────────────────────────────────────

function UserCard({
  profile,
  role,
  sucursalName,
  unidadesCount,
  isActive,
  onClick,
}: {
  profile: ProfileRow;
  role?: AppRole;
  sucursalName?: string;
  unidadesCount: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left card-elevated p-5 rounded-xl border border-border transition-all duration-150",
        "hover:border-primary/40 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        !isActive && "opacity-60",
      )}
    >
      <div className="flex items-start gap-4">
        <Avatar name={profile.nombreCompleto} email={profile.email} isActive={isActive} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate">
              {profile.nombreCompleto || "Sin nombre"}
            </p>
            <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 group-hover:text-primary transition-colors" />
          </div>

          <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.email}</p>

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {role ? (
              <span
                className={cn(
                  "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                  ROLE_COLORS[role],
                )}
              >
                {roleLabel(role)}
              </span>
            ) : (
              <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border text-muted-foreground border-border bg-muted/50">
                Sin rol
              </span>
            )}

            {profile.isAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                <Shield className="size-2.5" /> Admin
              </span>
            )}

            {!isActive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                <XCircle className="size-2.5" /> Inactivo
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {sucursalName && (
              <span className="flex items-center gap-1">
                <Building2 className="size-3" />
                {sucursalName}
              </span>
            )}
            {unidadesCount > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="size-3" />
                {unidadesCount} unidad{unidadesCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function EditUserDialog({
  open,
  profile,
  currentRole,
  isActive,
  assignedUnidadIds,
  assignedSucursalIds,
  sucursales,
  unidades,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: ProfileRow | null;
  currentRole?: AppRole;
  isActive: boolean;
  assignedUnidadIds: string[];
  assignedSucursalIds: string[];
  sucursales: { id: string; nombre: string }[];
  unidades: { id: string; nombre: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    onSaved();
  };

  const setRole = useMutation({
    mutationFn: (newRole: AppRole) => setUserRoleAction({ userId: profile!.id, newRole }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSucursal = useMutation({
    mutationFn: (sucursalId: string | null) =>
      setProfileSucursalAction({ userId: profile!.id, sucursalId }),
    onSuccess: () => {
      toast.success("Sucursal asignada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAdmin = useMutation({
    mutationFn: (val: boolean) => setProfileAdminAction({ userId: profile!.id, isAdmin: val }),
    onSuccess: () => {
      toast.success("Privilegios actualizados");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleUnidad = useMutation({
    mutationFn: ({ unidadId, checked }: { unidadId: string; checked: boolean }) =>
      toggleProfileUnidadAction({ profileId: profile!.id, unidadId, checked }),
    onSuccess: () => {
      toast.success("Unidades actualizadas");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSucursal = useMutation({
    mutationFn: ({ sucursalId, checked }: { sucursalId: string; checked: boolean }) =>
      toggleProfileSucursalAction({ profileId: profile!.id, sucursalId, checked }),
    onSuccess: () => {
      toast.success("Sucursales actualizadas");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPw = useMutation({
    mutationFn: () => resetPasswordAction({ userId: profile!.id, newPassword }),
    onSuccess: () => {
      toast.success("Contraseña restablecida");
      setResetPwOpen(false);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: () => setUserActiveAction({ userId: profile!.id, isActive: !isActive }),
    onSuccess: () => {
      toast.success(isActive ? "Usuario desactivado" : "Usuario activado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: () => deleteUserAction({ userId: profile!.id }),
    onSuccess: () => {
      toast.success("Usuario eliminado");
      setDeleteConfirmOpen(false);
      onClose();
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!profile) return null;

  const initials = (profile.nombreCompleto || profile.email || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className="size-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xl">
                {initials}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg leading-tight">
                  {profile.nombreCompleto || "Sin nombre"}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5 flex items-center gap-1">
                  <Mail className="size-3" /> {profile.email}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-5 pt-2">
            {/* Status badge */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2">
                {isActive ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <XCircle className="size-4 text-slate-400" />
                )}
                <span className="text-sm font-medium">
                  {isActive ? "Usuario activo" : "Usuario inactivo"}
                </span>
              </div>
              {profile.isAdmin && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Shield className="size-3" /> Administrador
                </span>
              )}
            </div>

            {/* Rol */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rol
              </Label>
              <Select value={currentRole} onValueChange={(v) => setRole.mutate(v as AppRole)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sin rol asignado" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sucursal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sucursal asignada
              </Label>
              <Select
                value={profile.sucursalId ?? "none"}
                onValueChange={(v) => setSucursal.mutate(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sin sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sucursal</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sucursales asignadas — coordinador puede cubrir más de una */}
            {currentRole === "coordinador" && sucursales.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sucursales asignadas
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {sucursales.map((s) => {
                    const checked = assignedSucursalIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background cursor-pointer hover:bg-muted/50 transition-colors text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            toggleSucursal.mutate({ sucursalId: s.id, checked: !!c })
                          }
                        />
                        <span className="truncate">{s.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unidades asignadas */}
            {unidades.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Unidades de negocio
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {unidades.map((u) => {
                    const checked = assignedUnidadIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background cursor-pointer hover:bg-muted/50 transition-colors text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            toggleUnidad.mutate({ unidadId: u.id, checked: !!c })
                          }
                        />
                        <span className="truncate">{u.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Admin toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Administrador</p>
                  <p className="text-xs text-muted-foreground">
                    Acceso total sin restricciones de RLS
                  </p>
                </div>
              </div>
              <Checkbox checked={profile.isAdmin} onCheckedChange={(c) => setAdmin.mutate(!!c)} />
            </div>

            {/* Acciones peligrosas */}
            <div className="border-t border-border pt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setResetPwOpen(true)}
              >
                <KeyRound className="size-3.5" /> Restablecer contraseña
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-1.5",
                  isActive
                    ? "text-amber-600 border-amber-300 hover:bg-amber-50"
                    : "text-emerald-600 border-emerald-300 hover:bg-emerald-50",
                )}
                onClick={() => toggleActive.mutate()}
                disabled={toggleActive.isPending}
              >
                <Power className="size-3.5" />
                {isActive ? "Desactivar" : "Activar"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 ml-auto"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="size-3.5" /> Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Restablecer contraseña
            </DialogTitle>
            <DialogDescription>
              Nueva contraseña para <strong>{profile.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nueva contraseña</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => resetPw.mutate()}
              disabled={newPassword.length < 8 || resetPw.isPending}
            >
              {resetPw.isPending ? <Spinner className="size-4 mr-2" /> : null}
              Restablecer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Eliminar usuario
            </DialogTitle>
            <DialogDescription>
              Esta acción es <strong>irreversible</strong>. Se eliminarán todos los datos de{" "}
              <strong>{profile.nombreCompleto || profile.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteUser.mutate()}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? <Spinner className="size-4 mr-2" /> : null}
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Create User Dialog ───────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  sucursales,
  unidades,
  onClose,
  onCreated,
}: {
  open: boolean;
  sucursales: { id: string; nombre: string }[];
  unidades: { id: string; nombre: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: "",
    password: "",
    nombreCompleto: "",
    role: "asesor" as AppRole,
    sucursalId: "",
    unidadNegocioId: "",
  });

  const create = useMutation({
    mutationFn: () =>
      createUserAction({
        email: form.email,
        password: form.password,
        nombreCompleto: form.nombreCompleto,
        role: form.role,
        sucursalId: form.sucursalId || null,
        unidadNegocioId: form.unidadNegocioId || null,
      }),
    onSuccess: () => {
      toast.success("Usuario creado correctamente");
      setForm({
        email: "",
        password: "",
        nombreCompleto: "",
        role: "asesor",
        sucursalId: "",
        unidadNegocioId: "",
      });
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" /> Nuevo usuario
          </DialogTitle>
          <DialogDescription>
            Crea un usuario y asígnale rol, sucursal y unidad de negocio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre completo</Label>
              <Input
                value={form.nombreCompleto}
                onChange={(e) => field("nombreCompleto", e.target.value)}
                placeholder="Ej. Ana Pérez"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Correo electrónico</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => field("email", e.target.value)}
                placeholder="correo@empresa.com"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contraseña inicial</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => field("password", e.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => field("role", v as AppRole)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select
                value={form.sucursalId || "none"}
                onValueChange={(v) => field("sucursalId", !v || v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {unidades.length > 0 && (
              <div className="col-span-2 space-y-1.5">
                <Label>Unidad de negocio (principal)</Label>
                <Select
                  value={form.unidadNegocioId || "none"}
                  onValueChange={(v) => field("unidadNegocioId", !v || v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Ninguna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!form.email || !form.password || form.password.length < 8 || create.isPending}
          >
            {create.isPending ? (
              <Spinner className="size-4 mr-2" />
            ) : (
              <Plus className="size-4 mr-2" />
            )}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const { role } = useAuth();
  const canView = role === "gerencia";

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: usuariosData, isLoading } = useQuery({
    queryKey: ["usuarios-data"],
    enabled: canView,
    queryFn: () => getUsuariosDataAction(),
  });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [permisosOpen, setPermisosOpen] = useState(false);

  // ALL HOOKS MUST BE CALLED BEFORE GUARD
  const profilesList = usuariosData?.profiles ?? [];
  const usersMap = new Map((usuariosData?.users ?? []).map((u) => [u.id, u]));
  const rolesMap = new Map((usuariosData?.roles ?? []).map((r) => [r.userId, r.role as AppRole]));
  const profileUnidades = usuariosData?.profileUnidades ?? [];
  const profileSucursales = usuariosData?.profileSucursales ?? [];

  const sucursalesMap = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profilesList;
    return profilesList.filter(
      (p) =>
        p.nombreCompleto?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        roleLabel(rolesMap.get(p.id) ?? null)
          .toLowerCase()
          .includes(q),
    );
  }, [profilesList, rolesMap, search]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Sólo el perfil Gerencia Nacional puede administrar usuarios y roles.
        </p>
      </div>
    );
  }

  const selectedProfile = profilesList.find((p) => p.id === selectedId) ?? null;
  const selectedRole = selectedProfile ? rolesMap.get(selectedProfile.id) : undefined;
  const selectedIsActive = selectedProfile
    ? (usersMap.get(selectedProfile.id)?.isActive ?? true)
    : true;
  const selectedUnidadIds = selectedProfile
    ? profileUnidades
        .filter((pu) => pu.profileId === selectedProfile.id)
        .map((pu) => pu.unidadNegocioId)
    : [];
  const selectedSucursalIds = selectedProfile
    ? profileSucursales
        .filter((ps) => ps.profileId === selectedProfile.id)
        .map((ps) => ps.sucursalId)
    : [];

  // Stats
  const totalActive = profilesList.filter((p) => usersMap.get(p.id)?.isActive ?? true).length;
  const totalAdmins = profilesList.filter((p) => p.isAdmin).length;
  const roleCount = ROLES.reduce(
    (acc, r) => {
      acc[r] = profilesList.filter((p) => rolesMap.get(p.id) === r).length;
      return acc;
    },
    {} as Record<AppRole, number>,
  );

  if (isLoading && !usuariosData) {
    return (
      <div className="flex flex-col gap-6 max-w-[1400px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-2">
              <UserCog className="size-7" /> Usuarios
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gestiona perfiles, roles y accesos de{" "}
              <span className="text-foreground font-medium">apereccvenequip.com</span>
            </p>
          </div>
        </div>
        <PageSkeleton kpis={4} blocks={[{ cols: 4, height: 160 }]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <UserCog className="size-7" /> Usuarios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona perfiles, roles y accesos de{" "}
            <span className="text-foreground font-medium">apereccvenequip.com</span>
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={() => setPermisosOpen((v) => !v)} className="gap-2">
            <Shield className="size-4" /> Permisos por rol
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Nuevo usuario
          </Button>
        </div>
      </div>

      {permisosOpen && <RolePermissionsPanel />}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-elevated p-4 rounded-xl flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium">Total usuarios</p>
          <p className="text-2xl font-bold font-display">{profilesList.length}</p>
          <p className="text-[11px] text-muted-foreground">{totalActive} activos</p>
        </div>
        <div className="card-elevated p-4 rounded-xl flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium">Administradores</p>
          <p className="text-2xl font-bold font-display text-primary">{totalAdmins}</p>
          <p className="text-[11px] text-muted-foreground">con acceso total</p>
        </div>
        <div className="card-elevated p-4 rounded-xl flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium">Gerentes</p>
          <p className="text-2xl font-bold font-display text-accent">
            {(roleCount.gerencia ?? 0) + (roleCount.gerente_comercial ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">nacional + comercial</p>
        </div>
        <div className="card-elevated p-4 rounded-xl flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium">Asesores</p>
          <p className="text-2xl font-bold font-display text-success">
            {(roleCount.asesor ?? 0) + (roleCount.coordinador ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">+ coordinadores</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, correo o rol…"
          className="pl-9"
        />
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
          <Spinner className="size-5" /> Cargando usuarios…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Users className="size-10 opacity-30" />
          <p className="text-sm">
            {search ? "Sin resultados para la búsqueda" : "No hay usuarios registrados"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <UserCard
              key={p.id}
              profile={p}
              role={rolesMap.get(p.id)}
              sucursalName={
                p.sucursalId ? (sucursalesMap.get(p.sucursalId) ?? undefined) : undefined
              }
              unidadesCount={profileUnidades.filter((pu) => pu.profileId === p.id).length}
              isActive={usersMap.get(p.id)?.isActive ?? true}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <EditUserDialog
        open={!!selectedId}
        profile={selectedProfile}
        currentRole={selectedRole}
        isActive={selectedIsActive}
        assignedUnidadIds={selectedUnidadIds}
        assignedSucursalIds={selectedSucursalIds}
        sucursales={sucursales ?? []}
        unidades={unidades ?? []}
        onClose={() => setSelectedId(null)}
        onSaved={() => {}}
      />

      {/* Create dialog */}
      <CreateUserDialog
        open={createOpen}
        sucursales={sucursales ?? []}
        unidades={unidades ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setCreateOpen(false)}
      />
    </div>
  );
}
