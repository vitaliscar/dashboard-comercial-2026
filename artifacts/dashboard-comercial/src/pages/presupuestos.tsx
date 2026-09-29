import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { money } from "@/lib/format";

type PremisaTipo = "crecimiento_pct" | "ajuste_fijo";
type PremisaAlcance = "global" | "unidad" | "sucursal" | "mes";

interface PremisaForm {
  id: string;
  tipo: PremisaTipo;
  alcance: PremisaAlcance;
  alcanceId: string;
  mes: number;
  valor: number;
}

interface ProyeccionRow {
  mes: number;
  sucursalId: string | null;
  sucursal: string | null;
  unidadNegocioId: string | null;
  unidad: string | null;
  basePresupuesto: string | number | null;
  realBase: string | number | null;
  sugerido: string | number | null;
}

interface VersionRow {
  id: string;
  anio: number;
  nombre: string;
  escenario: string;
  estado: "borrador" | "propuesto" | "aprobado" | "archivado";
  createdAt: string;
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const ESTADO_LABEL: Record<VersionRow["estado"], string> = {
  borrador: "Borrador",
  propuesto: "Propuesto",
  aprobado: "Aprobado",
  archivado: "Archivado",
};

function nuevaPremisa(): PremisaForm {
  return { id: crypto.randomUUID(), tipo: "crecimiento_pct", alcance: "global", alcanceId: "", mes: 1, valor: 5 };
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.message ?? "No se pudo completar la operación");
  }
  return r.json();
}

export default function PresupuestosPage() {
  const baseAnio = new Date().getFullYear();
  const targetAnio = baseAnio + 1;
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState(`Presupuesto ${targetAnio}`);
  const [escenario, setEscenario] = useState("base");
  const [premisas, setPremisas] = useState<PremisaForm[]>([nuevaPremisa()]);

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const premisasPayload = useMemo(
    () =>
      premisas.map((p) => ({
        tipo: p.tipo,
        alcance: p.alcance,
        alcanceId: p.alcance === "unidad" || p.alcance === "sucursal" ? p.alcanceId || null : null,
        mes: p.alcance === "mes" ? p.mes : null,
        valor: p.valor,
      })),
    [premisas],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["presupuestos", "proyeccion", baseAnio, targetAnio, JSON.stringify(premisasPayload)],
    queryFn: () =>
      api("/presupuestos/proyeccion-anual", {
        method: "POST",
        body: JSON.stringify({ baseAnio, targetAnio, premisas: premisasPayload }),
      }),
  });

  const { data: versiones } = useQuery({
    queryKey: ["presupuestos", "versiones", targetAnio],
    queryFn: () => api(`/presupuestos/versiones?anio=${targetAnio}`),
  });

  const crear = useMutation({
    mutationFn: async () => {
      const version = await api("/presupuestos/versiones", {
        method: "POST",
        body: JSON.stringify({ anio: targetAnio, nombre, escenario, premisas: premisasPayload }),
      });
      return api(`/presupuestos/versiones/${version.id}/generar`, {
        method: "POST",
        body: JSON.stringify({ anio: baseAnio, premisas: premisasPayload }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] }),
  });

  const aprobar = useMutation({
    mutationFn: (id: string) => api(`/presupuestos/versiones/${id}/aprobar`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] }),
  });

  const rows: ProyeccionRow[] = data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.sugerido ?? 0), 0);
  const baseTotal = rows.reduce((sum, row) => sum + Number(row.basePresupuesto ?? 0), 0);
  const realTotal = rows.reduce((sum, row) => sum + Number(row.realBase ?? 0), 0);

  const actualizarPremisa = (id: string, cambios: Partial<PremisaForm>) => {
    setPremisas((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planeación"
        title={`Presupuesto de ventas ${targetAnio}`}
        description={`Proyección basada en el presupuesto oficial ${baseAnio}, ajustada por las premisas de abajo.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Premisas de la propuesta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de versión" />
            <select
              className="rounded-md border bg-background px-3 h-9"
              value={escenario}
              onChange={(e) => setEscenario(e.target.value)}
            >
              <option value="conservador">Conservador</option>
              <option value="base">Base</option>
              <option value="optimista">Optimista</option>
            </select>
            <Button onClick={() => crear.mutate()} disabled={crear.isPending || !nombre.trim()}>
              {crear.isPending ? "Guardando…" : "Guardar propuesta"}
            </Button>
          </div>

          <div className="space-y-2">
            {premisas.map((premisa) => (
              <div key={premisa.id} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-center">
                <select
                  className="rounded-md border bg-background px-3 h-9"
                  value={premisa.tipo}
                  onChange={(e) => actualizarPremisa(premisa.id, { tipo: e.target.value as PremisaTipo })}
                >
                  <option value="crecimiento_pct">Crecimiento %</option>
                  <option value="ajuste_fijo">Ajuste fijo $</option>
                </select>

                <select
                  className="rounded-md border bg-background px-3 h-9"
                  value={premisa.alcance}
                  onChange={(e) => actualizarPremisa(premisa.id, { alcance: e.target.value as PremisaAlcance })}
                >
                  <option value="global">Todas las unidades/sucursales</option>
                  <option value="unidad">Solo una unidad de negocio</option>
                  <option value="sucursal">Solo una sucursal</option>
                  <option value="mes">Solo un mes</option>
                </select>

                {premisa.alcance === "unidad" && (
                  <select
                    className="rounded-md border bg-background px-3 h-9"
                    value={premisa.alcanceId}
                    onChange={(e) => actualizarPremisa(premisa.id, { alcanceId: e.target.value })}
                  >
                    <option value="">Elegir unidad…</option>
                    {unidades?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {unidadLabelInfo(u.nombre).label}
                      </option>
                    ))}
                  </select>
                )}

                {premisa.alcance === "sucursal" && (
                  <select
                    className="rounded-md border bg-background px-3 h-9"
                    value={premisa.alcanceId}
                    onChange={(e) => actualizarPremisa(premisa.id, { alcanceId: e.target.value })}
                  >
                    <option value="">Elegir sucursal…</option>
                    {sucursales?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                )}

                {premisa.alcance === "mes" && (
                  <select
                    className="rounded-md border bg-background px-3 h-9"
                    value={premisa.mes}
                    onChange={(e) => actualizarPremisa(premisa.id, { mes: Number(e.target.value) })}
                  >
                    {MESES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}

                {premisa.alcance === "global" && <div />}

                <Input
                  type="number"
                  value={premisa.valor}
                  onChange={(e) => actualizarPremisa(premisa.id, { valor: Number(e.target.value) })}
                  placeholder={premisa.tipo === "crecimiento_pct" ? "%" : "$"}
                />

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={premisas.length === 1}
                  onClick={() => setPremisas((prev) => prev.filter((p) => p.id !== premisa.id))}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPremisas((prev) => [...prev, nuevaPremisa()])}>
              + Agregar premisa
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Meta oficial {baseAnio}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(baseTotal)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Real registrado {baseAnio}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(realTotal)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sugerido {targetAnio}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{isLoading ? "…" : money(total)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proyección {targetAnio} por mes, sucursal y unidad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Mes</th>
                  <th className="p-2">Sucursal</th>
                  <th className="p-2">Unidad</th>
                  <th className="p-2 text-right">Meta base</th>
                  <th className="p-2 text-right">Real base</th>
                  <th className="p-2 text-right">Sugerido {targetAnio}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.mes}-${row.sucursalId}-${row.unidadNegocioId}`} className="border-b">
                    <td className="p-2">{MESES[row.mes - 1] ?? row.mes}</td>
                    <td className="p-2">{row.sucursal ?? "Todas"}</td>
                    <td className="p-2">{row.unidad ?? "Todas"}</td>
                    <td className="p-2 text-right">{money(Number(row.basePresupuesto ?? 0))}</td>
                    <td className="p-2 text-right">{money(Number(row.realBase ?? 0))}</td>
                    <td className="p-2 text-right font-medium">{money(Number(row.sugerido ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versiones guardadas {targetAnio}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Escenario</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Creado</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {(versiones as VersionRow[] | undefined ?? []).map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="p-2">{v.nombre}</td>
                    <td className="p-2 capitalize">{v.escenario}</td>
                    <td className="p-2">{ESTADO_LABEL[v.estado]}</td>
                    <td className="p-2">{new Date(v.createdAt).toLocaleDateString("es-VE")}</td>
                    <td className="p-2 text-right">
                      {v.estado === "propuesto" && (
                        <Button size="sm" onClick={() => aprobar.mutate(v.id)} disabled={aprobar.isPending}>
                          Aprobar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!versiones || (versiones as VersionRow[]).length === 0) && (
                  <tr>
                    <td className="p-2 text-muted-foreground" colSpan={5}>
                      Sin versiones guardadas para {targetAnio} todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
