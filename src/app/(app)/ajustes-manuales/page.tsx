"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getAjustesManualesAction,
  createAjusteManualAction,
  deleteAjusteManualAction,
} from "@/lib/actions/ajustes-manuales";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, MESES } from "@/lib/format";
import { PageSkeleton } from "@/components/ui/page-skeleton";

const anioActual = new Date().getFullYear();

export default function AjustesManualesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    mes: new Date().getMonth() + 1,
    sucursalId: "",
    unidadNegocioId: "",
    monto: "",
    motivo: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["ajustes-manuales", anioActual],
    queryFn: () => getAjustesManualesAction(anioActual),
    enabled: role === "gerencia",
  });

  const createMutation = useMutation({
    mutationFn: createAjusteManualAction,
    onSuccess: () => {
      toast.success("Ajuste registrado");
      queryClient.invalidateQueries({ queryKey: ["ajustes-manuales"] });
      setOpen(false);
      setForm({ mes: new Date().getMonth() + 1, sucursalId: "", unidadNegocioId: "", monto: "", motivo: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAjusteManualAction,
    onSuccess: () => {
      toast.success("Ajuste eliminado");
      queryClient.invalidateQueries({ queryKey: ["ajustes-manuales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "gerencia") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Solo gerencia puede administrar ajustes manuales.
      </div>
    );
  }

  function handleSubmit() {
    const monto = Number(form.monto);
    if (Number.isNaN(monto) || monto === 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (!form.motivo.trim()) {
      toast.error("El motivo es obligatorio");
      return;
    }
    createMutation.mutate({
      anio: anioActual,
      mes: form.mes,
      sucursalId: form.sucursalId || null,
      unidadNegocioId: form.unidadNegocioId || null,
      monto,
      motivo: form.motivo,
    });
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Administración"
        title="Ajustes Manuales"
        description={`Año ${anioActual} — solo gerencia. Estos ajustes viven aparte de las cargas automáticas y nunca se pierden al recargar datos.`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Nuevo ajuste
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo ajuste manual</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Mes</Label>
                  <Select
                    value={String(form.mes)}
                    onValueChange={(v) => setForm({ ...form, mes: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((label, i) => (
                        <SelectItem key={label} value={String(i + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sucursal (opcional)</Label>
                  <Select
                    value={form.sucursalId || "todas"}
                    onValueChange={(v) =>
                      setForm({ ...form, sucursalId: v === "todas" || !v ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {(sucursales ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unidad de Negocio (opcional)</Label>
                  <Select
                    value={form.unidadNegocioId || "todas"}
                    onValueChange={(v) =>
                      setForm({ ...form, unidadNegocioId: v === "todas" || !v ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {(unidades ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Monto (usar negativo para restar)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    placeholder="Ej: 5669.20 o -2141.00"
                  />
                </div>
                <div>
                  <Label>Motivo</Label>
                  <Input
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Ej: Ajuste contable factura GD-3389"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <PageSkeleton kpis={0} />
      ) : !data || data.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No hay ajustes manuales registrados en {anioActual}.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">Mes</th>
                <th className="py-2">Sucursal</th>
                <th className="py-2">Unidad</th>
                <th className="py-2 text-right">Monto</th>
                <th className="py-2">Motivo</th>
                <th className="py-2">Creado por</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2">{MESES[a.mes - 1]}</td>
                  <td className="py-2">{a.sucursal}</td>
                  <td className="py-2">{a.unidad}</td>
                  <td className="py-2 text-right">{money(a.monto)}</td>
                  <td className="py-2">{a.motivo}</td>
                  <td className="py-2">{a.creadoPor}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(a.id)}
                      aria-label="Eliminar ajuste"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
