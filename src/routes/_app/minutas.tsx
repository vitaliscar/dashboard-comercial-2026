import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusPill, estadoLabel, estadoKind } from "@/components/status-pill";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Plus,
  Trash2,
  Pencil,
  ClipboardList,
  CircleDashed,
  CircleDot,
  CircleCheck,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/minutas")({
  head: () => ({ meta: [{ title: "Minutas · CCV" }] }),
  component: Minutas,
});

interface Minuta {
  id: string;
  fecha: string;
  sucursal_id: string | null;
  unidad_negocio_id: string | null;
  cliente: string;
  descripcion: string;
  responsable: string;
  fecha_limite: string | null;
  estado: "pendiente" | "en_proceso" | "cumplido";
  updated_at: string;
}

function Minutas() {
  const { role, profile, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Minuta | null>(null);
  const canWrite = role === "gerencia" || role === "gerente_comercial" || role === "coordinador";
  const canDelete = role === "gerencia";
  const isCoordinador = role === "coordinador";

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: minutas, isLoading } = useQuery({
    queryKey: ["minutas", role, profile?.id],
    queryFn: async () => {
      const q = scoped(
        supabase.from("minutas").select("*").order("fecha", { ascending: false }),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "responsable_id" },
      );
      return (await q).data ?? [];
    },
  });

  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cliente: "",
    descripcion: "",
    responsable: "",
    fecha_limite: "",
    sucursal_id: profile?.sucursal_id ?? "",
    unidad_negocio_id: "",
    estado: "pendiente" as Minuta["estado"],
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      fecha: new Date().toISOString().slice(0, 10),
      cliente: "",
      descripcion: "",
      responsable: "",
      fecha_limite: "",
      sucursal_id: profile?.sucursal_id ?? "",
      unidad_negocio_id: "",
      estado: "pendiente",
    });
    setOpen(true);
  };
  const openEdit = (m: Minuta) => {
    setEditing(m);
    setForm({
      fecha: m.fecha,
      cliente: m.cliente,
      descripcion: m.descripcion,
      responsable: m.responsable,
      fecha_limite: m.fecha_limite ?? "",
      sucursal_id: isCoordinador ? (profile?.sucursal_id ?? "") : (m.sucursal_id ?? ""),
      unidad_negocio_id: "",
      estado: m.estado,
    });
    setOpen(true);
  };

  // Set unidad_negocio_id once unidades data is loaded (avoids showing UUID before items render)
  useEffect(() => {
    if (unidades === undefined) return;
    const targetId = editing
      ? (editing.unidad_negocio_id ?? "")
      : (profile?.unidad_negocio_id ?? "");
    if (targetId && !form.unidad_negocio_id) {
      setForm((f) => ({ ...f, unidad_negocio_id: targetId }));
    }
  }, [unidades, editing, profile?.unidad_negocio_id, form.unidad_negocio_id]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        fecha_limite: form.fecha_limite || null,
        sucursal_id: (isCoordinador ? profile?.sucursal_id : form.sucursal_id) || null,
        unidad_negocio_id: form.unidad_negocio_id || null,
        updated_by: user?.id,
      };
      if (editing) {
        const { error } = await supabase.from("minutas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("minutas")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Minuta actualizada" : "Minuta creada");
      qc.invalidateQueries({ queryKey: ["minutas"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("minutas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Minuta eliminada");
      qc.invalidateQueries({ queryKey: ["minutas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sucursalNombre = (id?: string | null) =>
    sucursales?.find((s) => s.id === id)?.nombre ?? "—";
  const unidadNombre = (id?: string | null) => unidades?.find((u) => u.id === id)?.nombre ?? "—";

  const resumen = useMemo(() => {
    const rows = (minutas ?? []) as Minuta[];
    const pendientes = rows.filter((m) => m.estado === "pendiente").length;
    const enProceso = rows.filter((m) => m.estado === "en_proceso").length;
    const cumplidas = rows.filter((m) => m.estado === "cumplido").length;
    const cumplimiento = rows.length > 0 ? (cumplidas / rows.length) * 100 : 0;
    return { total: rows.length, pendientes, enProceso, cumplidas, cumplimiento };
  }, [minutas]);

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="CRM / Compromisos"
        title="Minutas de gestión"
        description="Compromisos comerciales, seguimiento y auditoría"
        action={
          canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button onClick={openCreate} />}>
                <Plus data-icon="inline-start" /> Nueva minuta
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar minuta" : "Nueva minuta"}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Fecha límite</Label>
                    <Input
                      type="date"
                      value={form.fecha_limite}
                      onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <Label>Cliente</Label>
                    <Input
                      value={form.cliente}
                      onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Sucursal</Label>
                    {isCoordinador ? (
                      <Input value={sucursalNombre(profile?.sucursal_id)} disabled readOnly />
                    ) : (
                      <Select
                        items={sucursales?.map((s) => ({ value: s.id, label: s.nombre }))}
                        value={form.sucursal_id || undefined}
                        onValueChange={(v) => setForm({ ...form, sucursal_id: v ?? "" })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {sucursales?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Unidad de negocio</Label>
                    <Select
                      items={unidades?.map((u) => ({ value: u.id, label: u.nombre }))}
                      value={form.unidad_negocio_id || undefined}
                      onValueChange={(v) => setForm({ ...form, unidad_negocio_id: v ?? "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {unidades?.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <Label>Responsable</Label>
                    <Input
                      value={form.responsable}
                      onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <Label>Descripción del compromiso</Label>
                    <Textarea
                      rows={3}
                      value={form.descripcion}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      required
                    />
                  </div>
                  {editing && (
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label>Estado</Label>
                      <Select
                        items={[
                          { value: "pendiente", label: estadoLabel("pendiente") },
                          { value: "en_proceso", label: estadoLabel("en_proceso") },
                          { value: "cumplido", label: estadoLabel("cumplido") },
                        ]}
                        value={form.estado}
                        onValueChange={(v) => setForm({ ...form, estado: v as Minuta["estado"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendiente">Pendiente</SelectItem>
                          <SelectItem value="en_proceso">En proceso</SelectItem>
                          <SelectItem value="cumplido">Cumplido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => save.mutate()}
                    disabled={
                      save.isPending || !form.cliente || !form.descripcion || !form.responsable
                    }
                  >
                    Guardar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total" value={String(resumen.total)} icon={ClipboardList} />
        <KpiCard
          label="Pendientes"
          value={String(resumen.pendientes)}
          icon={CircleDashed}
          accent="warning"
        />
        <KpiCard
          label="En proceso"
          value={String(resumen.enProceso)}
          icon={CircleDot}
          accent="primary"
        />
        <KpiCard
          label="Cumplimiento"
          value={`${resumen.cumplimiento.toFixed(0)}%`}
          icon={CircleCheck}
          accent="success"
          hint={`${resumen.cumplidas} cumplidas`}
        />
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Fecha
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Cliente
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Descripción
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Responsable
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Sucursal
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Unidad
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Estado
                </TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Cargando…
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (minutas ?? []).length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          No hay minutas registradas todavía.{""}
                          {canWrite && "Crea la primera con el botón 'Nueva minuta'."}
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                (minutas as Minuta[]).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                      {m.fecha}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-medium">{m.cliente}</TableCell>
                    <TableCell className="px-4 py-3 max-w-md truncate" title={m.descripcion}>
                      {m.descripcion}
                    </TableCell>
                    <TableCell className="px-4 py-3">{m.responsable}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                      {sucursalNombre(m.sucursal_id)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                      {unidadNombre(m.unidad_negocio_id)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusPill kind={estadoKind(m.estado)}>{estadoLabel(m.estado)}</StatusPill>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {canWrite && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon" />}>
                            <Trash2 className="size-3.5 text-destructive" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar minuta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(m.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
