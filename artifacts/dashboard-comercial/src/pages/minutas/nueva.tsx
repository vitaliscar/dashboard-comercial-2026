"use client";

import { useLocation } from "wouter";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  createMinutaHttp,
  getAlertasAbiertasHttp,
  getDestinatariosHttp,
  searchClientesHttp,
} from "@/lib/minutas-http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export default function NuevaMinutaPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { role } = useAuth();

  const canCreate = role === "gerencia" || role === "gerente_comercial" || role === "coordinador";

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const { data: destinatarios } = useQuery({
    queryKey: ["destinatarios-disponibles"],
    queryFn: getDestinatariosHttp,
    enabled: canCreate,
  });

  const { data: alertasDisponibles } = useQuery({
    queryKey: ["alertas-abiertas"],
    queryFn: getAlertasAbiertasHttp,
    enabled: canCreate,
  });

  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    destinatarioId: "",
    cliente: "",
    descripcion: "",
    fechaLimite: "",
    sucursalId: null as string | null,
    unidadNegocioId: null as string | null,
    alertaIds: [] as string[],
  });

  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteSuggestions, setClienteSuggestions] = useState<string[]>([]);
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);

  useEffect(() => {
    if (clienteSearch.trim().length < 2) {
      setClienteSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setClienteSuggestions(await searchClientesHttp(clienteSearch));
      } catch {
        setClienteSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clienteSearch]);

  // Alertas del destinatario elegido, más importantes primero (ya vienen
  // ordenadas por severidad desde getAlertasAction).
  const alertasCandidatas = useMemo(() => {
    if (!alertasDisponibles || !form.destinatarioId) return [];
    return alertasDisponibles.filter(
      (a) =>
        a.asesorId === form.destinatarioId ||
        (form.sucursalId != null && a.sucursalId === form.sucursalId),
    );
  }, [alertasDisponibles, form.destinatarioId, form.sucursalId]);

  const handleSelectDestinatario = (destId: string) => {
    const dest = destinatarios?.find((d) => d.id === destId);
    setForm((f) => ({
      ...f,
      destinatarioId: destId,
      sucursalId: dest?.sucursalId ?? null,
      unidadNegocioId: dest?.unidadNegocioId ?? null,
      alertaIds: [],
    }));
  };

  const toggleAlertaCheckbox = (alertaId: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      alertaIds: checked ? [...f.alertaIds, alertaId] : f.alertaIds.filter((id) => id !== alertaId),
    }));
  };

  const save = useMutation({
    mutationFn: () =>
      createMinutaHttp({
        fecha: form.fecha,
        destinatarioId: form.destinatarioId,
        cliente: form.cliente.trim() || null,
        descripcion: form.descripcion,
        fechaLimite: form.fechaLimite || null,
        sucursalId: form.sucursalId,
        unidadNegocioId: form.unidadNegocioId,
        estado: "pendiente",
        alertaIds: form.alertaIds,
      }),
    onSuccess: () => {
      toast.success("Minuta creada");
      qc.invalidateQueries({ queryKey: ["minutas"] });
      qc.invalidateQueries({ queryKey: ["alertas-abiertas"] });
      setLocation("/minutas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sucursalNombre = (id?: string | null) =>
    sucursales?.find((s) => s.id === id)?.nombre ?? "—";
  const unidadNombre = (id?: string | null) => unidades?.find((u) => u.id === id)?.nombre ?? "—";

  const severidadVariant = (s: "alta" | "media" | "baja") =>
    s === "alta" ? "destructive" : s === "media" ? "secondary" : "outline";

  if (!canCreate) {
    setLocation("/minutas");
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="CRM / Compromisos"
        title="Nueva minuta"
        description="Redactá el compromiso y revisá las alertas abiertas del destinatario antes de enviarlo"
        action={
          <Button variant="outline" onClick={() => setLocation("/minutas")}>
            <ArrowLeft data-icon="inline-start" /> Volver
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
        <div className="card-elevated p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
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
                value={form.fechaLimite}
                onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <Label>Destinatario</Label>
              <Select
                items={destinatarios?.map((d) => ({
                  value: d.id,
                  label: `${d.nombreCompleto} (${d.role})`,
                }))}
                value={form.destinatarioId}
                onValueChange={(v) => handleSelectDestinatario(v ?? "")}
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

            <div className="flex flex-col gap-1 col-span-2 relative">
              <Label>Cliente (Opcional)</Label>
              <Input
                placeholder="Buscar cliente..."
                value={form.cliente}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, cliente: val });
                  setClienteSearch(val);
                  setShowClienteSuggestions(true);
                }}
                onFocus={() => setShowClienteSuggestions(true)}
                onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 200)}
              />
              {showClienteSuggestions && clienteSuggestions.length > 0 && (
                <div className="absolute top-[100%] left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                  {clienteSuggestions.map((sug) => (
                    <div
                      key={sug}
                      className="cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={() => {
                        setForm((f) => ({ ...f, cliente: sug }));
                        setClienteSearch(sug);
                        setShowClienteSuggestions(false);
                      }}
                    >
                      {sug}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label>Sucursal (Auto)</Label>
              <Input value={sucursalNombre(form.sucursalId)} disabled readOnly />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Unidad de negocio (Auto)</Label>
              <Input value={unidadNombre(form.unidadNegocioId)} disabled readOnly />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <Label>Descripción del compromiso</Label>
              <Textarea
                rows={5}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setLocation("/minutas")}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.descripcion.trim() || !form.destinatarioId}
            >
              {save.isPending ? "Guardando..." : "Guardar minuta"}
            </Button>
          </div>
        </div>

        <div className="card-elevated p-5 flex flex-col gap-3 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Alertas abiertas del destinatario</h3>
          </div>

          {!form.destinatarioId ? (
            <p className="text-xs text-muted-foreground italic">
              Seleccioná un destinatario para ver sus alertas más importantes y decidir si se
              convierten en un compromiso.
            </p>
          ) : alertasCandidatas.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Este destinatario no tiene alertas abiertas ahora mismo.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
              {alertasCandidatas.map((alerta) => {
                const checked = form.alertaIds.includes(alerta.id);
                return (
                  <label
                    key={alerta.id}
                    className="flex items-start gap-2 text-xs rounded-md border border-border p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggleAlertaCheckbox(alerta.id, Boolean(c))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{alerta.titulo}</span>
                        <Badge variant={severidadVariant(alerta.severidad)} className="text-[9px] shrink-0">
                          {alerta.severidad}
                        </Badge>
                      </div>
                      {alerta.contexto?.detalle && (
                        <span className="text-muted-foreground">{alerta.contexto.detalle}</span>
                      )}
                      {alerta.contexto?.accion && (
                        <span className="text-[10px] text-primary font-medium">
                          Sugerido: {alerta.contexto.accion}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {form.alertaIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
              {form.alertaIds.length} alerta(s) se adjuntarán a este compromiso.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
