"use client";

import { useLocation } from "wouter";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  createMinutaHttp,
  getAlertasAbiertasHttp,
  getDestinatariosHttp,
  getClientesDestinatarioHttp,
  type MinutaAlertaAbierta,
} from "@/lib/minutas-http";
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
import { PageHeader } from "@/components/page-header";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { ArrowLeft, AlertTriangle, Plus, Trash2, Lock } from "lucide-react";

type Compromiso = {
  key: string;
  descripcion: string;
  fechaLimite: string;
  cliente: string;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  alertaId: string | null;
  alertaTitulo: string | null;
  bloqueado: boolean; // cliente/unidad vienen de una alerta -- no editables
};

/**
 * Port del flujo nuevo de ccv-main (Next.js) 2026-09-04: una minuta = una
 * reunión con un destinatario, que puede generar VARIOS compromisos. Cada
 * "Agregar" acumula un compromiso en pantalla; "Guardar" los crea todos de
 * una vez llamando createMinutaHttp una vez por compromiso (mismo
 * destinatario/fecha) -- sin vínculo formal de "reunión" en la DB.
 *
 * Incluye el fix de alertas del mismo día: antes se mostraban alertas de
 * OTROS asesores de la misma sucursal (bug real reportado en producción).
 * Ahora solo se muestran alertas atribuidas directamente al destinatario, o
 * alertas de cliente (cobranza) cuyo cliente está en la cartera real de ese
 * destinatario.
 */
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

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [destinatarioId, setDestinatarioId] = useState("");
  const [sucursalDestinatario, setSucursalDestinatario] = useState<string | null>(null);
  const [unidadDestinatario, setUnidadDestinatario] = useState<string | null>(null);
  const [compromisos, setCompromisos] = useState<Compromiso[]>([]);

  const draftVacio = (): Omit<Compromiso, "key"> => ({
    descripcion: "",
    fechaLimite: "",
    cliente: "",
    sucursalId: sucursalDestinatario,
    unidadNegocioId: unidadDestinatario,
    alertaId: null,
    alertaTitulo: null,
    bloqueado: false,
  });
  const [draft, setDraft] = useState<Omit<Compromiso, "key">>(draftVacio());

  const { data: clientesDestinatario } = useQuery({
    queryKey: ["clientes-destinatario", destinatarioId],
    queryFn: () => getClientesDestinatarioHttp(destinatarioId),
    enabled: !!destinatarioId,
  });

  const alertaIdsUsadas = new Set(compromisos.map((c) => c.alertaId).filter(Boolean));
  const clientesDelDestinatario = useMemo(
    () => new Set((clientesDestinatario ?? []).map((c) => c.toLowerCase())),
    [clientesDestinatario],
  );
  const alertasCandidatas = useMemo(() => {
    if (!alertasDisponibles || !destinatarioId) return [];
    return alertasDisponibles.filter((a) => {
      if (alertaIdsUsadas.has(a.id)) return false;
      if (a.asesorId === destinatarioId) return true;
      const cliente = a.contexto?.cliente?.trim().toLowerCase();
      if (a.asesorId == null && cliente && clientesDelDestinatario.has(cliente)) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertasDisponibles, destinatarioId, clientesDelDestinatario, compromisos]);

  const handleSelectDestinatario = (destId: string) => {
    const dest = destinatarios?.find((d) => d.id === destId);
    setDestinatarioId(destId);
    setSucursalDestinatario(dest?.sucursalId ?? null);
    setUnidadDestinatario(dest?.unidadNegocioId ?? null);
    setCompromisos([]);
    setDraft({
      descripcion: "",
      fechaLimite: "",
      cliente: "",
      sucursalId: dest?.sucursalId ?? null,
      unidadNegocioId: dest?.unidadNegocioId ?? null,
      alertaId: null,
      alertaTitulo: null,
      bloqueado: false,
    });
  };

  const seleccionarAlerta = (alerta: MinutaAlertaAbierta) => {
    setDraft({
      descripcion: alerta.contexto?.accion ?? "",
      fechaLimite: "",
      cliente: alerta.contexto?.cliente ?? "",
      sucursalId: alerta.sucursalId ?? sucursalDestinatario,
      unidadNegocioId: alerta.unidadNegocioId ?? unidadDestinatario,
      alertaId: alerta.id,
      alertaTitulo: alerta.titulo,
      bloqueado: true,
    });
  };

  const quitarAlertaDelDraft = () => {
    setDraft((d) => ({
      ...d,
      cliente: "",
      alertaId: null,
      alertaTitulo: null,
      bloqueado: false,
      unidadNegocioId: unidadDestinatario,
      sucursalId: sucursalDestinatario,
    }));
  };

  const agregarCompromiso = () => {
    if (!draft.descripcion.trim()) return;
    setCompromisos((prev) => [...prev, { ...draft, key: crypto.randomUUID() }]);
    setDraft(draftVacio());
  };

  const quitarCompromiso = (key: string) => {
    setCompromisos((prev) => prev.filter((c) => c.key !== key));
  };

  const save = useMutation({
    mutationFn: async () => {
      for (const c of compromisos) {
        await createMinutaHttp({
          fecha,
          destinatarioId,
          cliente: c.cliente.trim() || null,
          descripcion: c.descripcion,
          fechaLimite: c.fechaLimite || null,
          sucursalId: c.sucursalId,
          unidadNegocioId: c.unidadNegocioId,
          estado: "pendiente",
          alertaIds: c.alertaId ? [c.alertaId] : [],
        });
      }
    },
    onSuccess: () => {
      toast.success(
        compromisos.length === 1 ? "Minuta creada" : `Minuta creada con ${compromisos.length} compromisos`,
      );
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
        description="Elegí el destinatario, revisá sus alertas abiertas y armá uno o varios compromisos para esta reunión"
        action={
          <Button variant="outline" onClick={() => setLocation("/minutas")}>
            <ArrowLeft data-icon="inline-start" /> Volver
          </Button>
        }
      />

      <div className="card-elevated p-5 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1 col-span-2">
          <Label>Destinatario</Label>
          <Select
            items={destinatarios?.map((d) => ({
              value: d.id,
              label: `${d.nombreCompleto} (${d.role})`,
            }))}
            value={destinatarioId}
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

        <div className="flex flex-col gap-1">
          <Label>Fecha de la reunión</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Sucursal del destinatario</Label>
          <Input value={sucursalNombre(sucursalDestinatario)} disabled readOnly />
        </div>
      </div>

      {!destinatarioId ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Seleccioná un destinatario para ver sus alertas y armar los compromisos de esta reunión.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
          <div className="card-elevated p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {draft.alertaId ? "Compromiso desde alerta" : "Nuevo compromiso"}
              </h3>
              {draft.alertaId && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={quitarAlertaDelDraft}>
                  Quitar alerta
                </Button>
              )}
            </div>

            {draft.alertaTitulo && (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <Lock className="size-3.5 text-primary shrink-0" />
                <span>
                  Cliente y unidad vienen de la alerta:{" "}
                  <strong className="font-semibold">{draft.alertaTitulo}</strong>
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 col-span-2">
                <Label>Cliente (opcional)</Label>
                {draft.bloqueado ? (
                  <Input value={draft.cliente || "—"} disabled readOnly />
                ) : (
                  <Select
                    items={[
                      { value: "", label: "Sin cliente específico" },
                      ...(clientesDestinatario ?? []).map((c) => ({ value: c, label: c })),
                    ]}
                    value={draft.cliente}
                    onValueChange={(v) => setDraft((d) => ({ ...d, cliente: v ?? "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin cliente específico</SelectItem>
                      {(clientesDestinatario ?? []).map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!draft.bloqueado && clientesDestinatario?.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No hay clientes con actividad registrada para este destinatario todavía.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <Label>Unidad de negocio</Label>
                {draft.bloqueado ? (
                  <Input value={unidadNombre(draft.unidadNegocioId)} disabled readOnly />
                ) : (
                  <Select
                    items={unidades?.map((u) => ({ value: u.id, label: u.nombre }))}
                    value={draft.unidadNegocioId ?? ""}
                    onValueChange={(v) => setDraft((d) => ({ ...d, unidadNegocioId: v || null }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar unidad..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label>Fecha límite</Label>
                <Input
                  type="date"
                  value={draft.fechaLimite}
                  onChange={(e) => setDraft((d) => ({ ...d, fechaLimite: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <Label>Descripción del compromiso *</Label>
                <Textarea
                  rows={4}
                  value={draft.descripcion}
                  onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={agregarCompromiso} disabled={!draft.descripcion.trim()}>
                <Plus data-icon="inline-start" /> Agregar a la minuta
              </Button>
            </div>

            {compromisos.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Compromisos de esta reunión ({compromisos.length})
                </h4>
                {compromisos.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium text-foreground">{c.descripcion}</p>
                      <p className="text-muted-foreground">
                        {c.cliente || "Sin cliente"} · {unidadNombre(c.unidadNegocioId)}
                        {c.fechaLimite ? ` · Vence ${c.fechaLimite}` : ""}
                        {c.alertaTitulo ? ` · Desde alerta` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => quitarCompromiso(c.key)} title="Quitar">
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setLocation("/minutas")}>
                Cancelar
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || compromisos.length === 0}>
                {save.isPending
                  ? "Guardando..."
                  : `Guardar minuta${compromisos.length > 1 ? ` (${compromisos.length} compromisos)` : ""}`}
              </Button>
            </div>
          </div>

          <div className="card-elevated p-5 flex flex-col gap-3 lg:sticky lg:top-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Alertas abiertas del destinatario</h3>
            </div>

            {alertasCandidatas.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No quedan alertas abiertas por convertir en compromiso -- podés seguir agregando
                compromisos manuales igual.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
                {alertasCandidatas.map((alerta) => (
                  <button
                    key={alerta.id}
                    type="button"
                    onClick={() => (draft.alertaId === alerta.id ? quitarAlertaDelDraft() : seleccionarAlerta(alerta))}
                    className={`flex flex-col gap-1 rounded-md border p-3 text-left text-xs transition ${
                      draft.alertaId === alerta.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
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
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
