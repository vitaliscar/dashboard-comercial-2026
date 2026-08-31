"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  AlertTriangle,
  ClockAlert,
  TrendingDown,
  Users,
  FileText,
  DollarSign,
  Target,
  CircleCheck,
  Check,
  Plus,
} from "lucide-react";
import { getAlertasAction } from "@/lib/actions/alertas";
import {
  resolveAlertaAction,
  getDestinatariosDisponiblesAction,
  createMinutaAction,
} from "@/lib/actions/minutas";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { money } from "@/lib/format";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
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
import { StatusPill } from "@/components/status-pill";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Severity = "alta" | "media" | "baja";
type AlertType =
  | "cobranzas"
  | "ventas_perdidas"
  | "minutas"
  | "cumplimiento"
  | "dependencia"
  | "cotizacion_factura"
  | "cotizaciones_viejas";

type AlertaServerItem = Awaited<ReturnType<typeof getAlertasAction>>[number];

export default function AlertasPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades, sucursales: selectedSucursales } = filters;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [minutaForm, setMinutaForm] = useState({
    destinatarioId: "",
    cliente: "",
    descripcion: "",
    fechaLimite: "",
  });

  const canCreateMinuta = role !== "asesor";

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursales ?? (f.sucursal ? [f.sucursal] : []),
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: unidades } = useUnidades();
  const { data: sucursales } = useSucursales();

  const sucursalOptions = useMemo(() => {
    if (!sucursales || role === "asesor") return [];
    return sucursales.map((s) => ({ value: s.id, label: s.nombre }));
  }, [sucursales, role]);

  const unitOptions = useMemo(() => {
    if (!unidades || role === "asesor") return [];
    return unidades.map((u) => ({ value: u.id, label: u.nombre }));
  }, [unidades, role]);

  const { data: rawAlertas, isLoading } = useQuery({
    queryKey: ["alertas-abiertas"],
    queryFn: () => getAlertasAction(),
  });

  const { data: destinatarios } = useQuery({
    queryKey: ["destinatarios-disponibles"],
    queryFn: () => getDestinatariosDisponiblesAction(),
    enabled: canCreateMinuta,
  });

  const resolveMutation = useMutation({
    mutationFn: async (alertaId: string) => {
      await resolveAlertaAction(alertaId);
    },
    onSuccess: (_, alertaId) => {
      toast.success("Alerta resuelta");
      setSelectedIds((prev) => prev.filter((id) => id !== alertaId));
      qc.invalidateQueries({ queryKey: ["alertas-abiertas"] });
      qc.invalidateQueries({ queryKey: ["minutas"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMinutaMutation = useMutation({
    mutationFn: async () => {
      const dest = destinatarios?.find((d) => d.id === minutaForm.destinatarioId);
      await createMinutaAction({
        fecha: new Date().toISOString().slice(0, 10),
        destinatarioId: minutaForm.destinatarioId,
        cliente: minutaForm.cliente.trim() || null,
        descripcion: minutaForm.descripcion,
        fechaLimite: minutaForm.fechaLimite || null,
        sucursalId: dest?.sucursalId ?? null,
        unidadNegocioId: dest?.unidadNegocioId ?? null,
        estado: "pendiente",
        alertaIds: selectedIds,
      });
    },
    onSuccess: () => {
      toast.success("Minuta creada con las alertas seleccionadas");
      setSelectedIds([]);
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["minutas"] });
      qc.invalidateQueries({ queryKey: ["alertas-abiertas"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const alertas = useMemo<AlertaServerItem[]>(() => {
    if (!rawAlertas) return [];
    return rawAlertas.filter((a) => {
      if (selectedSucursales.length > 0) {
        if (!a.sucursalId || !selectedSucursales.includes(a.sucursalId)) {
          return false;
        }
      }
      if (selectedUnidades.length > 0) {
        if (!a.unidadNegocioId || !selectedUnidades.includes(a.unidadNegocioId)) {
          return false;
        }
      }
      return true;
    });
  }, [rawAlertas, selectedSucursales, selectedUnidades]);

  const totals = useMemo(() => {
    const alta = alertas.filter((a) => a.severidad === "alta").length;
    const media = alertas.filter((a) => a.severidad === "media").length;
    const baja = alertas.filter((a) => a.severidad === "baja").length;
    const montoTotal = alertas.reduce((sum, a) => sum + (a.contexto?.monto ?? 0), 0);
    return { alta, media, baja, total: alertas.length, montoTotal };
  }, [alertas]);

  const allVisibleSelected = useMemo(() => {
    if (alertas.length === 0) return false;
    return alertas.every((a) => selectedIds.includes(a.id));
  }, [alertas, selectedIds]);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleIds = alertas.map((a) => a.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    } else {
      const visibleSet = new Set(alertas.map((a) => a.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    }
  };

  const toggleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const openCreateMinutaDialog = () => {
    const selectedAlerts = alertas.filter((a) => selectedIds.includes(a.id));
    const summary = selectedAlerts.map((a) => a.titulo).join(", ");
    setMinutaForm({
      destinatarioId: "",
      cliente: "",
      descripcion:
        selectedAlerts.length > 0 ? `Atacar ${selectedAlerts.length} alertas: ${summary}` : "",
      fechaLimite: "",
    });
    setDialogOpen(true);
  };

  const severityKind = (s: Severity) => {
    if (s === "alta") return "danger" as const;
    if (s === "media") return "warning" as const;
    return "neutral" as const;
  };

  const tipoIcon = (t: AlertType) => {
    switch (t) {
      case "cobranzas":
        return DollarSign;
      case "ventas_perdidas":
        return TrendingDown;
      case "minutas":
        return ClockAlert;
      case "cumplimiento":
        return Target;
      case "dependencia":
        return AlertTriangle;
      case "cotizacion_factura":
        return Users;
      case "cotizaciones_viejas":
        return FileText;
    }
  };

  const tipoLabel = (t: AlertType) => {
    switch (t) {
      case "cobranzas":
        return "Cobranzas";
      case "ventas_perdidas":
        return "Ventas perdidas";
      case "minutas":
        return "Minutas";
      case "cumplimiento":
        return "Cumplimiento";
      case "dependencia":
        return "Dependencia";
      case "cotizacion_factura":
        return "Cotización → Factura";
      case "cotizaciones_viejas":
        return "Cotizaciones viejas";
    }
  };

  if (isLoading && !rawAlertas) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Torre de control"
          title="Alertas"
          description="Avisos importantes sobre cobranzas, cumplimiento y riesgos comerciales"
        />
        <PageSkeleton kpis={4} blocks={[{ cols: 1, height: 400 }]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Torre de control"
        title="Alertas"
        description="Avisos importantes sobre cobranzas, cumplimiento y riesgos comerciales"
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unitOptions}
        sucursalOptions={sucursalOptions}
        sucursalMulti={role === "gerencia"}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Urgentes"
          value={String(totals.alta)}
          icon={AlertTriangle}
          accent="danger"
          hint="hay que actuar ya"
        />
        <KpiCard
          label="En revisión"
          value={String(totals.media)}
          icon={ClockAlert}
          accent="warning"
          hint="dar seguimiento"
        />
        <KpiCard
          label="Total avisos"
          value={String(totals.total)}
          icon={BellRing}
          hint={`${totals.alta + totals.media} activos`}
        />
        <KpiCard
          label="Dinero en riesgo"
          value={money(totals.montoTotal)}
          icon={DollarSign}
          accent="ochre"
          hint="monto total en alertas"
        />
      </div>

      {canCreateMinuta && selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-4 p-3 bg-muted/60 border border-border rounded-lg shadow-sm">
          <span className="text-sm font-medium">
            {selectedIds.length} alerta{selectedIds.length > 1 ? "s" : ""} seleccionada
            {selectedIds.length > 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={openCreateMinutaDialog}>
            <Plus data-icon="inline-start" /> Crear minuta con estas alertas
          </Button>
        </div>
      )}

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <BellRing className="size-5" />
          <h3 className="font-display font-semibold">Avisos ordenados por importancia</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {alertas.length} avisos activos
          </span>
        </div>
        <div className="[&_[data-slot=table-container]]:max-h-140 [&_[data-slot=table-container]]:overflow-y-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary [&_tr]:border-b-0 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 bg-primary text-primary-foreground text-center px-3 py-2.5">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(c) => toggleSelectAll(Boolean(c))}
                    aria-label="Seleccionar todas"
                  />
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Importancia
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Área
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Qué pasa
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Detalle
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  Monto
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Qué hacer
                </TableHead>
                <TableHead className="bg-primary text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                    Revisando datos…
                  </TableCell>
                </TableRow>
              ) : alertas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CircleCheck className="text-success" />
                        </EmptyMedia>
                        <EmptyTitle>Todo en orden</EmptyTitle>
                        <EmptyDescription>
                          No hay avisos pendientes para los filtros actuales.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                alertas.map((a) => {
                  const Icon = tipoIcon(a.tipo as AlertType);
                  const isSelected = selectedIds.includes(a.id);
                  return (
                    <TableRow
                      key={a.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                    >
                      <TableCell className="px-3 py-3 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) => toggleSelectRow(a.id, Boolean(c))}
                          aria-label={`Seleccionar alerta ${a.titulo}`}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <StatusPill kind={severityKind(a.severidad)}>
                          {a.severidad === "alta"
                            ? "Urgente"
                            : a.severidad === "media"
                              ? "Importante"
                              : "Baja"}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Icon className="inline size-4 mr-1.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {tipoLabel(a.tipo as AlertType)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-sm">{a.titulo}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                        {a.contexto?.detalle ?? "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums font-medium">
                        {a.contexto?.monto ? money(a.contexto.monto) : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {a.contexto?.accion && (
                          <span className="text-xs font-medium text-primary">
                            {a.contexto.accion}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {canCreateMinuta && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate(a.id)}
                          >
                            <Check className="size-3.5" />
                            Marcar resuelta
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear minuta con alertas seleccionadas</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="flex flex-col gap-1 col-span-2">
              <Label>Destinatario</Label>
              <Select
                items={destinatarios?.map((d) => ({
                  value: d.id,
                  label: `${d.nombreCompleto} (${d.role})`,
                }))}
                value={minutaForm.destinatarioId || undefined}
                onValueChange={(v) => setMinutaForm((f) => ({ ...f, destinatarioId: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar destinatario..." />
                </SelectTrigger>
                <SelectContent>
                  {destinatarios?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombreCompleto} ({d.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <Label>Cliente (Opcional)</Label>
              <Input
                placeholder="Nombre del cliente..."
                value={minutaForm.cliente}
                onChange={(e) => setMinutaForm((f) => ({ ...f, cliente: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <Label>Descripción del compromiso</Label>
              <Textarea
                rows={4}
                value={minutaForm.descripcion}
                onChange={(e) => setMinutaForm((f) => ({ ...f, descripcion: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <Label>Fecha límite (Opcional)</Label>
              <Input
                type="date"
                value={minutaForm.fechaLimite}
                onChange={(e) => setMinutaForm((f) => ({ ...f, fechaLimite: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMinutaMutation.mutate()}
              disabled={
                createMinutaMutation.isPending ||
                !minutaForm.destinatarioId ||
                !minutaForm.descripcion.trim()
              }
            >
              {createMinutaMutation.isPending ? "Creando..." : "Crear minuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
