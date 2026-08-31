"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getMinutasAction,
  updateMinutaAction,
  deleteMinutaAction,
  addComentarioAction,
  resolveAlertaAction,
  type MinutaEstado,
} from "@/lib/actions/minutas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Plus,
  Trash2,
  Pencil,
  ClipboardList,
  CircleDashed,
  CircleDot,
  CircleCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  Send,
  CheckCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";

interface MinutaComentario {
  id: string;
  minutaId: string;
  autorId: string;
  texto: string;
  createdAt: string | Date;
}

interface MinutaAlerta {
  minutaId: string;
  alertaId: string;
  tipo: string;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  estado: string;
}

interface MinutaItem {
  id: string;
  fecha: string;
  cliente: string | null;
  descripcion: string;
  fechaLimite: string | null;
  estado: MinutaEstado;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  destinatarioId: string;
  destinatarioNombre: string | null;
  createdBy: string;
  createdAt: string | Date;
  comentarios: MinutaComentario[];
  alertas: MinutaAlerta[];
}

export default function MinutasPage() {
  const { role, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MinutaItem | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const canCreate = role === "gerencia" || role === "gerente_comercial" || role === "coordinador";
  const canDelete = role === "gerencia";

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: minutas, isLoading } = useQuery({
    queryKey: ["minutas"],
    queryFn: () => getMinutasAction() as Promise<MinutaItem[]>,
  });

  const [sucursalFilter, setSucursalFilter] = useState<string>("all");

  const minutasFiltradas = useMemo(() => {
    if (sucursalFilter === "all") return minutas ?? [];
    return (minutas ?? []).filter((m) => m.sucursalId === sucursalFilter);
  }, [minutas, sucursalFilter]);

  // Form state (solo edición — la creación vive en /minutas/nueva)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    destinatarioId: "",
    cliente: "",
    descripcion: "",
    fechaLimite: "",
    sucursalId: "" as string | null,
    unidadNegocioId: "" as string | null,
    estado: "pendiente" as MinutaEstado,
    alertaIds: [] as string[],
  });

  const openEdit = (m: MinutaItem) => {
    setEditing(m);
    setForm({
      fecha: m.fecha,
      destinatarioId: m.destinatarioId,
      cliente: m.cliente ?? "",
      descripcion: m.descripcion,
      fechaLimite: m.fechaLimite ?? "",
      sucursalId: m.sucursalId,
      unidadNegocioId: m.unidadNegocioId,
      estado: m.estado,
      alertaIds: [],
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () =>
      updateMinutaAction(editing!.id, {
        descripcion: form.descripcion,
        fechaLimite: form.fechaLimite || null,
        estado: form.estado,
      }),
    onSuccess: () => {
      toast.success("Minuta actualizada");
      qc.invalidateQueries({ queryKey: ["minutas"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteMinutaAction(id);
    },
    onSuccess: () => {
      toast.success("Minuta eliminada");
      qc.invalidateQueries({ queryKey: ["minutas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Comments functionality
  const [comentarioTexto, setComentarioTexto] = useState<{ [key: string]: string }>({});

  const addComentarioMut = useMutation({
    mutationFn: async ({ minutaId, texto }: { minutaId: string; texto: string }) => {
      await addComentarioAction(minutaId, texto);
    },
    onSuccess: (_, variables) => {
      toast.success("Comentario agregado");
      setComentarioTexto((prev) => ({ ...prev, [variables.minutaId]: "" }));
      qc.invalidateQueries({ queryKey: ["minutas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveAlertaMut = useMutation({
    mutationFn: async (alertaId: string) => {
      await resolveAlertaAction(alertaId);
    },
    onSuccess: () => {
      toast.success("Alerta marcada como resuelta");
      qc.invalidateQueries({ queryKey: ["minutas"] });
      qc.invalidateQueries({ queryKey: ["alertas-abiertas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sucursalNombre = (id?: string | null) =>
    sucursales?.find((s) => s.id === id)?.nombre ?? "—";
  const unidadNombre = (id?: string | null) => unidades?.find((u) => u.id === id)?.nombre ?? "—";

  const resumen = useMemo(() => {
    const rows = minutasFiltradas;
    const pendientes = rows.filter((m) => m.estado === "pendiente").length;
    const enProceso = rows.filter((m) => m.estado === "en_proceso").length;
    const cumplidas = rows.filter((m) => m.estado === "cumplido").length;
    const cumplimiento = rows.length > 0 ? (cumplidas / rows.length) * 100 : 0;
    return { total: rows.length, pendientes, enProceso, cumplidas, cumplimiento };
  }, [minutasFiltradas]);

  if (isLoading && !minutas) {
    return <PageSkeleton kpis={4} blocks={[{ cols: 1, height: 400 }]} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CRM / Compromisos"
        title="Minutas de gestión"
        description="Compromisos comerciales, seguimiento y auditoría"
        action={
          canCreate && (
            <>
              <Button onClick={() => router.push("/minutas/nueva")}>
                <Plus data-icon="inline-start" /> Nueva minuta
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Editar minuta</DialogTitle>
                  </DialogHeader>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label>Destinatario</Label>
                      <Input value={editing?.destinatarioNombre ?? "—"} disabled readOnly />
                    </div>
                    {editing?.cliente && (
                      <div className="flex flex-col gap-1 col-span-2">
                        <Label>Cliente</Label>
                        <Input value={editing.cliente} disabled readOnly />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label>Descripción del compromiso</Label>
                      <Textarea
                        rows={3}
                        value={form.descripcion}
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Fecha límite</Label>
                      <Input
                        type="date"
                        value={form.fechaLimite}
                        onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Estado</Label>
                      <Select
                        items={[
                          { value: "pendiente", label: estadoLabel("pendiente") },
                          { value: "en_proceso", label: estadoLabel("en_proceso") },
                          { value: "cumplido", label: estadoLabel("cumplido") },
                        ]}
                        value={form.estado}
                        onValueChange={(v) => setForm({ ...form, estado: v as MinutaEstado })}
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
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => save.mutate()}
                      disabled={save.isPending || !form.descripcion.trim()}
                    >
                      {save.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
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

      {role !== "asesor" && sucursales && sucursales.length > 1 && (
        <div className="bg-card border border-border shadow-sm rounded-md px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <Label className="text-[11px] font-semibold text-muted-foreground tracking-wide whitespace-nowrap">
            Filtrar por sucursal:
          </Label>
          <Select
            items={[
              { value: "all", label: "Todas" },
              ...sucursales.map((s) => ({ value: s.id, label: s.nombre })),
            ]}
            value={sucursalFilter}
            onValueChange={(v) => setSucursalFilter(v ?? "all")}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-2 text-center text-primary-foreground" />
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Fecha
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Destinatario
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Cliente
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Descripción
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
                  <TableCell colSpan={9} className="py-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : minutasFiltradas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <ClipboardList />
                        </EmptyMedia>
                        <EmptyTitle>No hay minutas registradas todavía</EmptyTitle>
                        {canCreate && (
                          <EmptyDescription>
                            Creá la primera con el botón &quot;Nueva minuta&quot;.
                          </EmptyDescription>
                        )}
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                minutasFiltradas.map((m) => {
                  const isExpanded = expandedRowId === m.id;
                  const isDestinatario = user?.id === m.destinatarioId;

                  return (
                    <React.Fragment key={m.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedRowId(isExpanded ? null : m.id)}
                      >
                        <TableCell className="px-2 text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="size-4 inline" />
                          ) : (
                            <ChevronRight className="size-4 inline" />
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                          {m.fecha}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-medium">
                          {m.destinatarioNombre ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-medium">{m.cliente ?? "—"}</TableCell>
                        <TableCell className="px-4 py-3 max-w-xs truncate" title={m.descripcion}>
                          {m.descripcion}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                          {sucursalNombre(m.sucursalId)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                          {unidadNombre(m.unidadNegocioId)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <StatusPill kind={estadoKind(m.estado)}>
                            {estadoLabel(m.estado)}
                          </StatusPill>
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canCreate && (
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

                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="p-4 border-b border-border">
                            <div className="flex flex-col gap-4 max-w-3xl">
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
                                  Descripción completa
                                </h4>
                                <p className="text-sm bg-background p-3 rounded-md border border-border whitespace-pre-wrap">
                                  {m.descripcion}
                                </p>
                                {m.fechaLimite && (
                                  <span className="text-xs text-muted-foreground mt-1 block">
                                    Fecha límite:{" "}
                                    <strong className="font-semibold">{m.fechaLimite}</strong>
                                  </span>
                                )}
                              </div>

                              {m.alertas && m.alertas.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
                                    <AlertTriangle className="size-3.5 text-amber-500" /> Alertas
                                    enganchadas ({m.alertas.length})
                                  </h4>
                                  <div className="flex flex-col gap-2">
                                    {m.alertas.map((alerta) => (
                                      <div
                                        key={alerta.alertaId}
                                        className="flex items-center justify-between gap-3 bg-background border border-border rounded-md px-3 py-2 text-xs"
                                      >
                                        <div className="flex items-center gap-2 truncate">
                                          <Badge
                                            variant={
                                              alerta.severidad === "alta"
                                                ? "destructive"
                                                : alerta.severidad === "media"
                                                  ? "secondary"
                                                  : "outline"
                                            }
                                            className="text-[9px]"
                                          >
                                            {alerta.severidad}
                                          </Badge>
                                          <span className="font-medium truncate">
                                            {alerta.titulo}
                                          </span>
                                        </div>

                                        {role !== "asesor" && alerta.estado === "abierta" && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[11px] gap-1 shrink-0"
                                            onClick={() => resolveAlertaMut.mutate(alerta.alertaId)}
                                            disabled={resolveAlertaMut.isPending}
                                          >
                                            <CheckCircle className="size-3 text-emerald-600" />{" "}
                                            Marcar resuelta
                                          </Button>
                                        )}
                                        {alerta.estado === "resuelta" && (
                                          <Badge
                                            variant="ghost"
                                            className="text-emerald-600 text-[10px]"
                                          >
                                            Resuelta
                                          </Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
                                  <MessageSquare className="size-3.5" /> Hilo de comentarios (
                                  {m.comentarios.length})
                                </h4>
                                {m.comentarios.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic bg-background p-3 rounded-md border border-border">
                                    No hay comentarios en esta minuta.
                                  </p>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    {m.comentarios.map((c) => (
                                      <div
                                        key={c.id}
                                        className="bg-background border border-border rounded-md p-3 text-xs flex flex-col gap-1"
                                      >
                                        <div className="flex items-center justify-between text-muted-foreground">
                                          <span className="font-semibold text-foreground">
                                            {c.autorId === m.destinatarioId
                                              ? (m.destinatarioNombre ?? "Destinatario")
                                              : "Usuario"}
                                          </span>
                                          <span className="text-[10px]">
                                            {new Date(c.createdAt).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-foreground whitespace-pre-wrap">
                                          {c.texto}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {isDestinatario && (
                                  <div className="flex flex-col gap-2 mt-3 bg-background border border-border rounded-md p-3">
                                    <Label className="text-xs font-semibold">
                                      Agregar comentario
                                    </Label>
                                    <Textarea
                                      rows={2}
                                      placeholder="Escribe una respuesta o actualización..."
                                      value={comentarioTexto[m.id] ?? ""}
                                      onChange={(e) =>
                                        setComentarioTexto({
                                          ...comentarioTexto,
                                          [m.id]: e.target.value,
                                        })
                                      }
                                    />
                                    <div className="flex justify-end">
                                      <Button
                                        size="sm"
                                        className="gap-1 text-xs"
                                        onClick={() =>
                                          addComentarioMut.mutate({
                                            minutaId: m.id,
                                            texto: comentarioTexto[m.id] ?? "",
                                          })
                                        }
                                        disabled={
                                          addComentarioMut.isPending ||
                                          !comentarioTexto[m.id]?.trim()
                                        }
                                      >
                                        <Send className="size-3" /> Enviar comentario
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
