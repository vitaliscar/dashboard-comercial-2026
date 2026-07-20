import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
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

export const Route = createFileRoute("/_app/usuarios")({
  head: () => ({ meta: [{ title: "Usuarios · CCV" }] }),
  component: Usuarios,
});

function Usuarios() {
  const { role } = useAuth();
  const qc = useQueryClient();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () =>
      (await supabase.from("profiles").select("*").order("nombre_completo")).data ?? [],
  });
  const { data: rolesRows } = useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
  });
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: profileUnidades } = useQuery({
    queryKey: ["profile_unidades_negocio"],
    queryFn: async () => (await supabase.from("profile_unidades_negocio").select("*")).data ?? [],
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rol actualizado");
      qc.invalidateQueries({ queryKey: ["user_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSucursal = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ sucursal_id: val })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sucursal asignada");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setUnidad = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ unidad_negocio_id: val })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidad asignada");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAdmin = useMutation({
    mutationFn: async ({ userId, val }: { userId: string; val: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_admin: val }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Privilegios de administrador actualizados");
      qc.invalidateQueries({ queryKey: ["profiles"] });
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
      if (checked) {
        const { error } = await supabase
          .from("profile_unidades_negocio")
          .insert({ profile_id: profileId, unidad_negocio_id: unidadId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profile_unidades_negocio")
          .delete()
          .eq("profile_id", profileId)
          .eq("unidad_negocio_id", unidadId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Unidades actualizadas");
      qc.invalidateQueries({ queryKey: ["profile_unidades_negocio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "gerencia") {
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

  const rolesMap = new Map(rolesRows?.map((r) => [r.user_id, r.role as AppRole]));
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
            ) : (profiles ?? []).length === 0 ? (
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
              profiles!.map((p) => {
                const current = rolesMap.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre_completo ?? "—"}</TableCell>
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
                        value={p.sucursal_id ?? undefined}
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
                        value={p.unidad_negocio_id ?? undefined}
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
                          const checked = (profileUnidades ?? []).some(
                            (pu) => pu.profile_id === p.id && pu.unidad_negocio_id === u.id,
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
                          checked={p.is_admin}
                          onCheckedChange={(checked) =>
                            setAdmin.mutate({ userId: p.id, val: !!checked })
                          }
                          aria-label={`Permisos de administrador para ${p.nombre_completo || p.email}`}
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
