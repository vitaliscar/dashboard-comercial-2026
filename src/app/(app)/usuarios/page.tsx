"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getUsuariosDataAction,
  setUserRoleAction,
  setProfileSucursalAction,
  setProfileUnidadAction,
  setProfileAdminAction,
  toggleProfileUnidadAction,
} from "@/lib/actions/usuarios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Shield } from "lucide-react";
import { roleLabel } from "@/lib/format";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";

export default function UsuariosPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canView = role === "gerencia";

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: usuariosData, isLoading } = useQuery({
    queryKey: ["usuarios-data"],
    enabled: canView,
    queryFn: () => getUsuariosDataAction(),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      await setUserRoleAction({ userId, newRole });
    },
    onSuccess: () => {
      toast.success("Rol actualizado");
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSucursal = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: string | null }) => {
      await setProfileSucursalAction({ userId, sucursalId: val });
    },
    onSuccess: () => {
      toast.success("Sucursal asignada");
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setUnidad = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: string | null }) => {
      await setProfileUnidadAction({ userId, unidadNegocioId: val });
    },
    onSuccess: () => {
      toast.success("Unidad asignada");
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAdmin = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: boolean }) => {
      await setProfileAdminAction({ userId, isAdmin: val });
    },
    onSuccess: () => {
      toast.success("Privilegios de administrador actualizados");
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleUnidad = useMutation({
    mutationFn: async ({
      profileId,
      unidadId,
      checked,
    }: {
      profileId: string;
      unidadId: string;
      checked: boolean;
    }) => {
      await toggleProfileUnidadAction({ profileId, unidadId, checked });
    },
    onSuccess: () => {
      toast.success("Unidades actualizadas");
      qc.invalidateQueries({ queryKey: ["usuarios-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ALL HOOKS MUST BE UNCONDITIONALLY CALLED BEFORE THIS GUARD
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

  const profilesList = usuariosData?.profiles ?? [];
  const rolesMap = new Map((usuariosData?.roles ?? []).map((r) => [r.userId, r.role as AppRole]));
  const profileUnidades = usuariosData?.profileUnidades ?? [];
  const ROLES: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];

  return (
    <div className="flex flex-col gap-6 max-w-[1400px]">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Users className="size-7" /> Administración de usuarios
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Asigna roles, sucursales y unidades de negocio
        </p>
      </div>

      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader className="bg-primary [&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Nombre
              </TableHead>
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Email
              </TableHead>
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Rol
              </TableHead>
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Sucursal
              </TableHead>
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Unidad
              </TableHead>
              <TableHead className="text-primary-foreground text-left text-xs tracking-wider">
                Unidades asignadas
              </TableHead>
              <TableHead className="text-primary-foreground text-center text-xs tracking-wider w-24">
                Administrador
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Cargando…
                  </span>
                </TableCell>
              </TableRow>
            ) : profilesList.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Users />
                      </EmptyMedia>
                      <EmptyTitle>No hay usuarios aún</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              profilesList.map((p) => {
                const current = rolesMap.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombreCompleto ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      <Select
                        items={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
                        value={current}
                        onValueChange={(v) =>
                          setRole.mutate({ userId: p.id, newRole: v as AppRole })
                        }
                      >
                        <SelectTrigger className="w-48 h-8">
                          <SelectValue placeholder="Sin rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        items={sucursales?.map((s) => ({ value: s.id, label: s.nombre }))}
                        value={p.sucursalId ?? undefined}
                        onValueChange={(v) => setSucursal.mutate({ userId: p.id, val: v })}
                      >
                        <SelectTrigger className="w-44 h-8">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {sucursales?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        items={unidades?.map((u) => ({ value: u.id, label: u.nombre }))}
                        value={p.unidadNegocioId ?? undefined}
                        onValueChange={(v) => setUnidad.mutate({ userId: p.id, val: v })}
                      >
                        <SelectTrigger className="w-44 h-8">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {unidades?.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {unidades?.map((u) => {
                          const checked = profileUnidades.some(
                            (pu) => pu.profileId === p.id && pu.unidadNegocioId === u.id,
                          );
                          return (
                            <label key={u.id} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  toggleUnidad.mutate({
                                    profileId: p.id,
                                    unidadId: u.id,
                                    checked: !!c,
                                  })
                                }
                              />
                              {u.nombre}
                            </label>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={p.isAdmin}
                          onCheckedChange={(checked) =>
                            setAdmin.mutate({ userId: p.id, val: !!checked })
                          }
                          aria-label={`Permisos de administrador para ${p.nombreCompleto || p.email}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
