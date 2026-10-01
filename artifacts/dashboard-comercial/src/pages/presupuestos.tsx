import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { money } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { Textarea } from "@/components/ui/textarea";
import PresupuestoCoordinadorPage from "./presupuesto-coordinador";

interface ParticipacionUnidad {
  unidadNegocioId: string | null;
  participacion: number;
  gestionComercialPct: number;
  gestionComercialMonto: number | null;
}

interface ParticipacionSucursal {
  unidadNegocioId: string | null;
  sucursalId: string | null;
  participacion: number;
}

interface Distribucion {
  crecimientoAnualPct: number;
  unidades: ParticipacionUnidad[];
  sucursales: ParticipacionSucursal[];
  meses: Array<{ unidadNegocioId: string | null; mes: number; participacion: number }>;
}

interface ProyeccionRow {
  mes: number;
  sucursalId: string | null;
  sucursal: string | null;
  unidadNegocioId: string | null;
  unidad: string | null;
  basePresupuesto: string | number;
  realBase: string | number;
  sugerido: string | number;
}

interface ProyeccionData {
  baseAnio: number;
  targetAnio: number;
  versionBaseId: string | null;
  distribucion: Distribucion;
  metaBase: number;
  metaMinima: number;
  metaPropuesta: number;
  montoGestionComercialTotal: number;
  metaTotalConGestion: number;
  totalesUnidad: Array<{ unidadNegocioId: string | null; metaBase: number; gestionComercialPct: number; gestionComercialMonto: number; metaTotal: number }>;
  errores: string[];
  rows: ProyeccionRow[];
}

interface VersionRow {
  id: string;
  anio: number;
  nombre: string;
  escenario: string;
  estado: "borrador" | "propuesto" | "aprobado" | "archivado";
  createdAt: string;
  descripcion?: string | null;
  premisas?: {
    tipo?: string;
    metaPropuesta?: number | string;
    metaTotalConGestion?: number | string;
    montoGestionComercialTotal?: number | string;
    unidadSolicitanteIds?: string[];
    sucursales?: ParticipacionSucursal[];
    meses?: Distribucion["meses"];
  } | null;
}

interface SucursalResumen {
  unidadNegocioId: string | null;
  sucursalId: string | null;
  nombre: string;
  participacion: number;
  base: number;
  meta: number;
  real: number;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const ESTADO_LABEL: Record<VersionRow["estado"], string> = {
  borrador: "Borrador",
  propuesto: "Propuesto",
  aprobado: "Aprobado",
  archivado: "Revisión anterior",
};

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

function sumaParticipacion(items: Array<{ participacion: number }>) {
  return items.reduce((sum, item) => sum + Number(item.participacion || 0), 0);
}

function PresupuestoGerenciaPage() {
  const targetAnio = new Date().getFullYear();
  const baseAnio = targetAnio - 1;
  const queryClient = useQueryClient();
  const { role, profile } = useAuth();
  const esGerenteComercial = role === "gerente_comercial";
  const unidadesAsignadas = profile?.unidades_negocio_ids?.length
    ? profile.unidades_negocio_ids
    : profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : [];
  const [nombre, setNombre] = useState(`Revisión presupuesto ${targetAnio}`);
  const [planTrabajo, setPlanTrabajo] = useState("");
  const [distribucion, setDistribucion] = useState<Distribucion | null>(null);
  const [unidadSucursalActiva, setUnidadSucursalActiva] = useState<string | null>(null);
  const [busquedaSucursal, setBusquedaSucursal] = useState("");
  const [ordenSucursal, setOrdenSucursal] = useState<"meta" | "nombre" | "participacion">("meta");
  const { data: unidades } = useUnidades();
  const { data: sucursalesCatalogo } = useSucursales();

  const proyeccion = useQuery<ProyeccionData>({
    queryKey: ["presupuestos", "distribucion", targetAnio, JSON.stringify(distribucion)],
    queryFn: () => api("/presupuestos/proyeccion-anual", {
      method: "POST",
      body: JSON.stringify({ modo: "distribucion", baseAnio, targetAnio, ...(distribucion ? { distribucion: esGerenteComercial ? { ...distribucion, crecimientoAnualPct: 0, unidades: [] } : distribucion } : {}) }),
    }),
  });

  useEffect(() => {
    if (!distribucion && proyeccion.data?.distribucion) setDistribucion(proyeccion.data.distribucion);
  }, [distribucion, proyeccion.data?.distribucion]);

  const {
    data: versiones,
    isError: versionesError,
    error: versionesErrorDetail,
    refetch: refetchVersiones,
  } = useQuery<VersionRow[]>({
    queryKey: ["presupuestos", "versiones", targetAnio],
    queryFn: () => api(`/presupuestos/versiones?anio=${targetAnio}`),
  });

  const ultimaMetaAprobada = useMemo(() => {
    const aprobada = versiones?.find((version) => version.estado === "aprobado");
    const meta = aprobada?.premisas?.metaTotalConGestion ?? aprobada?.premisas?.metaPropuesta;
    return meta == null ? null : Number(meta);
  }, [versiones]);

  const crear = useMutation({
    mutationFn: async () => {
      if (!distribucion) throw new Error("La distribución todavía está cargando.");
      const version = await api("/presupuestos/versiones", {
        method: "POST",
        body: JSON.stringify({ anio: targetAnio, baseAnio, nombre, escenario: "base", ...(esGerenteComercial ? { descripcion: planTrabajo.trim() } : {}), distribucion: esGerenteComercial ? { ...distribucion, crecimientoAnualPct: 0, unidades: [] } : distribucion }),
      });
      if (esGerenteComercial) return version;
      return api(`/presupuestos/versiones/${version.id}/generar`, {
        method: "POST",
        body: JSON.stringify({ anio: baseAnio, distribucion: esGerenteComercial ? { ...distribucion, crecimientoAnualPct: 0, unidades: [] } : distribucion }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] }),
  });

  const aprobar = useMutation({
    mutationFn: (id: string) => api(`/presupuestos/versiones/${id}/aprobar`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] }),
  });

  const data = proyeccion.data;
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) =>
      !esGerenteComercial || (row.unidadNegocioId !== null && unidadesAsignadas.includes(row.unidadNegocioId)),
    ),
    [data?.rows, esGerenteComercial, unidadesAsignadas.join("|")],
  );
  const totalUnidad = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = row.unidadNegocioId ?? "__sin_unidad__";
      totals.set(key, (totals.get(key) ?? 0) + Number(row.sugerido ?? 0));
    }
    return totals;
  }, [rows]);
  const resumenUnidad = new Map((data?.totalesUnidad ?? []).map((unidad) => [unidad.unidadNegocioId ?? "__sin_unidad__", unidad]));
  const unidadesVisibles = (distribucion?.unidades ?? []).filter((unidad) =>
    !esGerenteComercial || (unidad.unidadNegocioId !== null && unidadesAsignadas.includes(unidad.unidadNegocioId)),
  );
  const idUnidadActiva = unidadesVisibles.some((unidad) => unidad.unidadNegocioId === unidadSucursalActiva)
    ? unidadSucursalActiva
    : unidadesVisibles[0]?.unidadNegocioId ?? null;
  const sucursalesResumen = useMemo(() => {
    const agregadas = new Map<string, SucursalResumen>();
    for (const row of rows) {
      const key = `${row.unidadNegocioId ?? "__sin_unidad__"}:${row.sucursalId ?? "__sin_sucursal__"}`;
      const actual = agregadas.get(key) ?? {
        unidadNegocioId: row.unidadNegocioId,
        sucursalId: row.sucursalId,
        nombre: row.sucursal ?? "Sin sucursal",
        participacion: distribucion?.sucursales.find((item) => item.unidadNegocioId === row.unidadNegocioId && item.sucursalId === row.sucursalId)?.participacion ?? 0,
        base: 0,
        meta: 0,
        real: 0,
      };
      actual.base += Number(row.basePresupuesto ?? 0);
      actual.meta += Number(row.sugerido ?? 0);
      actual.real += Number(row.realBase ?? 0);
      agregadas.set(key, actual);
    }
    return [...agregadas.values()]
      .filter((item) => item.unidadNegocioId === idUnidadActiva)
      .sort((a, b) => ordenSucursal === "nombre" ? a.nombre.localeCompare(b.nombre, "es")
        : ordenSucursal === "participacion" ? b.participacion - a.participacion
          : b.meta - a.meta);
  }, [rows, distribucion?.sucursales, idUnidadActiva, ordenSucursal]);
  const sucursalesFiltradas = sucursalesResumen.filter((item) => item.nombre.toLocaleLowerCase("es").includes(busquedaSucursal.trim().toLocaleLowerCase("es")));

  const actualizarCrecimiento = (valor: number) => setDistribucion((actual) => actual ? { ...actual, crecimientoAnualPct: valor } : actual);
  const actualizarUnidad = (id: string | null, valor: number) => setDistribucion((actual) => actual ? {
    ...actual,
    unidades: actual.unidades.map((unidad) => unidad.unidadNegocioId === id ? { ...unidad, participacion: valor } : unidad),
  } : actual);
  const actualizarGestionComercial = (id: string | null, valor: number) => setDistribucion((actual) => actual ? {
    ...actual,
    unidades: actual.unidades.map((unidad) => unidad.unidadNegocioId === id ? { ...unidad, gestionComercialPct: valor } : unidad),
  } : actual);
  const actualizarSucursal = (unidadId: string | null, sucursalId: string | null, valor: number) => setDistribucion((actual) => actual ? {
    ...actual,
    sucursales: actual.sucursales.map((sucursal) =>
      sucursal.unidadNegocioId === unidadId && sucursal.sucursalId === sucursalId
        ? { ...sucursal, participacion: valor }
        : sucursal,
    ),
  } : actual);
  const actualizarMes = (unidadId: string | null, mes: number, valor: number) => setDistribucion((actual) => actual ? {
    ...actual,
    meses: actual.meses.map((item) => item.unidadNegocioId === unidadId && item.mes === mes ? { ...item, participacion: valor } : item),
  } : actual);

  const erroresLocales = useMemo(() => {
    if (!distribucion) return [];
    const errores: string[] = [];
    if (!esGerenteComercial && Math.abs(sumaParticipacion(distribucion.unidades) - 100) > 0.011) errores.push("Los pesos base por unidad deben sumar 100 %.");
    for (const unidad of unidadesVisibles) {
      const sucursalesUnidad = distribucion.sucursales.filter((item) => item.unidadNegocioId === unidad.unidadNegocioId);
      if (sucursalesUnidad.some((item) => item.participacion < 0 || item.participacion > 100) || Math.abs(sumaParticipacion(sucursalesUnidad) - 100) > 0.011) {
        errores.push(`La participación de las sucursales de ${unidad.unidadNegocioId ?? "la unidad"} debe sumar 100 %.`);
      }
      const mesesUnidad = distribucion.meses.filter((item) => item.unidadNegocioId === unidad.unidadNegocioId);
      if (mesesUnidad.some((item) => item.participacion < 0 || item.participacion > 100) || Math.abs(sumaParticipacion(mesesUnidad) - 100) > 0.011) {
        errores.push(`La distribución mensual de ${unidad.unidadNegocioId ?? "la unidad"} debe sumar 100 %.`);
      }
      if (!esGerenteComercial && (unidad.gestionComercialPct < 0 || unidad.gestionComercialPct > 100)) {
        errores.push("Cada porcentaje de Gestión Comercial debe estar entre 0 % y 100 %.");
      }
    }
    return errores;
  }, [distribucion, unidadesVisibles, esGerenteComercial]);
  const erroresVisibles = [...new Set([...(data?.errores ?? []), ...erroresLocales])];
  const configLista = !!data && erroresVisibles.length === 0;
  const puedeGuardar = !!distribucion && configLista && !proyeccion.isFetching && !crear.isPending && !!nombre.trim() && (!esGerenteComercial || planTrabajo.trim().length >= 20);

  if (esGerenteComercial) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Planeación comercial"
          title={`Presupuesto ${targetAnio}`}
          description="Distribuye la meta asignada a tu unidad entre sucursales y meses. Gerencia Nacional conserva la meta anual y aprueba los cambios."
        />

        <Card>
          <CardHeader><CardTitle>Distribución por sucursal y mes</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {unidadesVisibles.map((unidad) => {
              const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
              const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : "Unidad";
              const sucursalesUnidad = sucursalesResumen.filter((item) => item.unidadNegocioId === unidad.unidadNegocioId);
              const mesesUnidad = (distribucion?.meses ?? []).filter((item) => item.unidadNegocioId === unidad.unidadNegocioId).sort((a, b) => a.mes - b.mes);
              const totalSucursales = sumaParticipacion(sucursalesUnidad);
              const totalMeses = sumaParticipacion(mesesUnidad);
              const metaUnidad = totalUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__") ?? 0;

              return (
                <section key={unidad.unidadNegocioId ?? "sin-unidad"} className="space-y-4 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-semibold">{nombreUnidad}</h3><p className="text-sm text-muted-foreground">Meta asignada: {money(metaUnidad)}</p></div>
                    <span className={Math.abs(totalSucursales - 100) > 0.011 || Math.abs(totalMeses - 100) > 0.011 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                      Sucursales {totalSucursales.toFixed(2)} % · Meses {totalMeses.toFixed(2)} %
                    </span>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr className="border-b text-left"><th className="p-2">Sucursal</th><th className="p-2 text-right">Participación</th><th className="p-2 text-right">Presupuesto anual</th></tr></thead>
                      <tbody>{sucursalesUnidad.map((sucursal) => (
                        <tr key={sucursal.sucursalId ?? sucursal.nombre} className="border-b last:border-0">
                          <td className="p-2">{sucursal.nombre}</td>
                          <td className="w-44 p-2"><div className="flex items-center gap-2"><Input aria-label={`Participación ${sucursal.nombre} en ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={sucursal.participacion} onChange={(event) => actualizarSucursal(unidad.unidadNegocioId, sucursal.sucursalId, Number(event.target.value))} className="text-right" /><span>%</span></div></td>
                          <td className="p-2 text-right tabular-nums">{money(metaUnidad * sucursal.participacion / 100)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold">Distribución mensual</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{mesesUnidad.map((item) => (
                      <label key={item.mes} className="text-sm"><span className="mb-1 block text-muted-foreground">{MESES[item.mes - 1]}</span><div className="flex items-center gap-2"><Input aria-label={`Participación ${MESES[item.mes - 1]} de ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={item.participacion} onChange={(event) => actualizarMes(unidad.unidadNegocioId, item.mes, Number(event.target.value))} className="text-right" /><span>%</span><span className="min-w-24 text-right tabular-nums">{money(metaUnidad * item.participacion / 100)}</span></div></label>
                    ))}</div>
                  </div>
                </section>
              );
            })}
            {erroresVisibles.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Presentar plan de distribución</CardTitle><p className="text-sm text-muted-foreground">La propuesta queda pendiente de revisión. No cambia la meta anual aprobada.</p></CardHeader>
          <CardContent className="space-y-3">
            <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre de la revisión" aria-label="Nombre de la revisión" />
            <div><label htmlFor="plan-comercial" className="mb-1 block text-sm font-medium">Justificación y plan comercial</label><Textarea id="plan-comercial" value={planTrabajo} onChange={(event) => setPlanTrabajo(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="Describe las acciones que respaldan la distribución propuesta…" aria-describedby="plan-comercial-ayuda" /><p id="plan-comercial-ayuda" className="mt-1 text-xs text-muted-foreground">Mínimo 20 caracteres. {planTrabajo.trim().length}/2.000</p></div>
            <Button onClick={() => crear.mutate()} disabled={!puedeGuardar}>{crear.isPending ? "Presentando…" : "Presentar propuesta"}</Button>
          </CardContent>
          {(crear.error || proyeccion.error) && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{(crear.error ?? proyeccion.error)?.message}</p>}
        </Card>

        <Card>
          <CardHeader><CardTitle>Mis propuestas · {targetAnio}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {versionesError && <QueryErrorNotice error={versionesErrorDetail} onRetry={() => void refetchVersiones()} fallback="No se pudieron cargar tus propuestas." />}
            {(versiones ?? []).map((version) => <div key={version.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{version.nombre}</span><span className="text-sm text-muted-foreground">{ESTADO_LABEL[version.estado]}</span></div>{version.descripcion && <p className="mt-2 text-sm text-muted-foreground">{version.descripcion}</p>}</div>)}
            {!versionesError && versiones?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay propuestas.</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planeación"
        title={`Presupuesto ${targetAnio}`}
        description={esGerenteComercial ? "Distribuye la meta asignada a tu unidad entre sucursales y meses." : "Ajusta la meta anual, distribuye entre unidades y define la participación por sucursal y mes."}
      />

      <section aria-label="Etapas del presupuesto" className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4 sm:p-4">
        {(esGerenteComercial
          ? ["Meta anual aprobada", "Distribuye por sucursal", "Distribuye por mes", "Envía el plan"]
          : ["Define aumento anual", "Asigna peso y gestión", "Revisa impacto", "Aprueba versión"]
        ).map((etapa, index) => (
          <div key={etapa} className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono font-semibold text-primary">{index + 1}</span>
            <span className="font-medium">{etapa}</span>
          </div>
        ))}
      </section>

      {!esGerenteComercial && <Card>
        <CardHeader><CardTitle>Revisión de la meta anual</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Meta base</label>
            <div className="h-9 content-center text-lg font-semibold">{data ? money(data.metaBase) : "Cargando…"}</div>
            <p className="text-xs text-muted-foreground">{data?.versionBaseId ? "Última versión aprobada" : `Presupuesto ${data?.baseAnio ?? baseAnio}`}</p>
          </div>
          <div>
            <label htmlFor="crecimiento-anual" className="mb-1 block text-sm text-muted-foreground">Aumento anual (%)</label>
            <Input
              id="crecimiento-anual"
              type="number"
              min="0"
              max="500"
              step="0.1"
              value={distribucion?.crecimientoAnualPct ?? 0}
              onChange={(event) => actualizarCrecimiento(Number(event.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Piso aprobado</label>
            <div className="h-9 content-center text-lg font-semibold">{data ? money(data.metaMinima) : "Cargando…"}</div>
            <p className="text-xs text-muted-foreground">No se permite proponer una cifra menor.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Nueva meta anual</label>
            <div className="h-9 content-center text-lg font-semibold text-primary">{data ? money(data.metaPropuesta) : "Cargando…"}</div>
            {data && data.metaPropuesta > data.metaMinima && <p className="text-xs text-muted-foreground">Aumento de {money(data.metaPropuesta - data.metaMinima)}</p>}
          </div>
        </CardContent>
      </Card>}

      {erroresVisibles.map((error) => (
        <div key={error} role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      ))}

      {!esGerenteComercial && <Card>
        <CardHeader>
          <CardTitle>Participación por unidad de negocio</CardTitle>
          <p className="text-sm text-muted-foreground">El peso base distribuye la meta anual. En la primera generación, el % de Gestión Comercial calcula un monto sobre la base de cada unidad. Al aprobarse, ese monto queda fijo en moneda para las revisiones siguientes.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-2">Unidad de negocio</th><th className="p-2 text-right">Peso base</th><th className="p-2 text-right">Meta base</th><th className="p-2 text-right">% GC</th><th className="p-2 text-right">Monto GC</th><th className="p-2 text-right">Total asignado</th></tr></thead>
              <tbody>
                {distribucion?.unidades.map((unidad) => {
                  const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
                  const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : (unidad.unidadNegocioId ? "Unidad" : "Sin unidad asignada");
                  const total = resumenUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__");
                  const montoFijado = unidad.gestionComercialMonto !== null;
                  return (
                    <tr key={unidad.unidadNegocioId ?? "sin-unidad"} className="border-b">
                      <td className="p-2 font-medium">{nombreUnidad}</td>
                      <td className="w-36 p-2"><Input aria-label={`Peso base ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={unidad.participacion} onChange={(event) => actualizarUnidad(unidad.unidadNegocioId, Number(event.target.value))} className="text-right" /></td>
                      <td className="p-2 text-right tabular-nums">{money(total?.metaBase ?? 0)}</td>
                      <td className="w-32 p-2"><Input aria-label={`Porcentaje de gestión comercial ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={unidad.gestionComercialPct} disabled={montoFijado} onChange={(event) => actualizarGestionComercial(unidad.unidadNegocioId, Number(event.target.value))} className="text-right" /></td>
                      <td className="p-2 text-right tabular-nums">{money(unidad.gestionComercialMonto ?? total?.gestionComercialMonto ?? 0)}{montoFijado && <span className="ml-1 text-xs text-muted-foreground">fijo</span>}</td>
                      <td className="p-2 text-right font-medium tabular-nums">{money(total?.metaTotal ?? totalUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__") ?? 0)}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold"><td className="p-2">Total</td><td className={`p-2 text-right ${Math.abs(sumaParticipacion(distribucion?.unidades ?? []) - 100) > 0.011 ? "text-destructive" : "text-primary"}`}>{sumaParticipacion(distribucion?.unidades ?? []).toFixed(2)} %</td><td className="p-2 text-right">{money(data?.metaPropuesta ?? 0)}</td><td className="p-2 text-right text-muted-foreground">—</td><td className="p-2 text-right">{money(data?.montoGestionComercialTotal ?? 0)}</td><td className="p-2 text-right">{money(data?.metaTotalConGestion ?? 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle>{esGerenteComercial ? "Asignación por sucursal" : "Balance de metas por sucursal"}</CardTitle>
          <p className="text-sm text-muted-foreground">Compara la base, la venta real y la meta distribuida. La suma de participación de la unidad debe ser 100 %.</p>
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            <label className="text-sm"><span className="mb-1 block text-muted-foreground">Unidad de negocio</span><select aria-label="Unidad de negocio para ver sucursales" value={idUnidadActiva ?? ""} onChange={(event) => setUnidadSucursalActiva(event.target.value || null)} className="h-10 w-full rounded-lg border border-input bg-background px-3">{unidadesVisibles.map((unidad) => { const info = unidades?.find((item) => item.id === unidad.unidadNegocioId); return <option key={unidad.unidadNegocioId ?? "sin-unidad"} value={unidad.unidadNegocioId ?? ""}>{info ? unidadLabelInfo(info.nombre).label : "Unidad"}</option>; })}</select></label>
            <label className="text-sm"><span className="mb-1 block text-muted-foreground">Buscar sucursal</span><Input value={busquedaSucursal} onChange={(event) => setBusquedaSucursal(event.target.value)} placeholder="Nombre de sucursal" aria-label="Buscar sucursal" /></label>
            <label className="text-sm"><span className="mb-1 block text-muted-foreground">Ordenar por</span><select aria-label="Ordenar sucursales" value={ordenSucursal} onChange={(event) => setOrdenSucursal(event.target.value as typeof ordenSucursal)} className="h-10 w-full rounded-lg border border-input bg-background px-3"><option value="meta">Mayor meta</option><option value="participacion">Mayor participación</option><option value="nombre">Nombre A–Z</option></select></label>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(() => {
            const unidad = unidadesVisibles.find((item) => item.unidadNegocioId === idUnidadActiva);
            const info = unidades?.find((item) => item.id === idUnidadActiva);
            const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : "Unidad";
            const metaUnidad = totalUnidad.get(idUnidadActiva ?? "__sin_unidad__") ?? 0;
            const participacionUnidad = distribucion?.sucursales.filter((item) => item.unidadNegocioId === idUnidadActiva) ?? [];
            const totalPct = sumaParticipacion(participacionUnidad);
            const topParticipacion = Math.max(0, ...sucursalesResumen.map((item) => item.participacion));
            return unidad ? <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Total de la unidad</div><div className="mt-1 text-lg font-semibold tabular-nums">{money(metaUnidad)}</div></div>
                <div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Participación distribuida</div><div className={`mt-1 text-lg font-semibold tabular-nums ${Math.abs(totalPct - 100) > 0.011 ? "text-destructive" : "text-primary"}`}>{totalPct.toFixed(2)} %</div></div>
                <div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Sucursal con mayor peso</div><div className="mt-1 text-lg font-semibold tabular-nums">{topParticipacion.toFixed(2)} %</div></div>
              </div>
              <div className="overflow-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 bg-muted/70 text-left"><tr className="border-b"><th className="p-3">Sucursal</th><th className="p-3 text-right">Base {baseAnio}</th><th className="p-3 text-right">Venta real {baseAnio}</th><th className="p-3 text-right">Participación</th><th className="p-3 text-right">Meta {targetAnio}</th><th className="p-3 text-right">Cambio vs base</th></tr></thead>
                  <tbody>
                    {sucursalesFiltradas.map((sucursal) => {
                      const variacion = sucursal.base > 0 ? (sucursal.meta / sucursal.base - 1) * 100 : null;
                      return <tr key={`${sucursal.unidadNegocioId}:${sucursal.sucursalId}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{sucursal.nombre}</td>
                        <td className="p-3 text-right tabular-nums">{money(sucursal.base)}</td>
                        <td className="p-3 text-right tabular-nums">{money(sucursal.real)}</td>
                        <td className="w-48 p-3"><div className="flex items-center gap-3"><Input aria-label={`Participación ${sucursal.nombre} en ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={sucursal.participacion} onChange={(event) => actualizarSucursal(sucursal.unidadNegocioId, sucursal.sucursalId, Number(event.target.value))} className="text-right" /><span className="text-muted-foreground">%</span></div></td>
                        <td className="p-3 text-right font-medium tabular-nums">{money(sucursal.meta)}</td>
                        <td className={`p-3 text-right tabular-nums ${variacion !== null && variacion > 0 ? "text-primary" : "text-muted-foreground"}`}>{variacion === null ? "Nueva" : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)} %`}</td>
                      </tr>;
                    })}
                    <tr className="bg-muted/40 font-semibold"><td className="p-3">Total {nombreUnidad}</td><td className="p-3 text-right tabular-nums">{money(sucursalesResumen.reduce((sum, item) => sum + item.base, 0))}</td><td className="p-3 text-right tabular-nums">{money(sucursalesResumen.reduce((sum, item) => sum + item.real, 0))}</td><td className={`p-3 text-right tabular-nums ${Math.abs(totalPct - 100) > 0.011 ? "text-destructive" : "text-primary"}`}>{totalPct.toFixed(2)} %</td><td className="p-3 text-right tabular-nums">{money(metaUnidad)}</td><td className="p-3" /></tr>
                    {sucursalesFiltradas.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No hay sucursales que coincidan con la búsqueda.</td></tr>}
                  </tbody>
                </table>
              </div>
            </> : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Tu perfil no tiene unidades de negocio asignadas.</div>;
          })()}
          {esGerenteComercial && distribucion?.unidades.filter((unidad) => unidad.unidadNegocioId !== null && unidadesAsignadas.includes(unidad.unidadNegocioId)).map((unidad) => {
            const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
            const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : "Unidad";
            const mesesUnidad = distribucion.meses.filter((item) => item.unidadNegocioId === unidad.unidadNegocioId).sort((a, b) => a.mes - b.mes);
            const totalMeses = sumaParticipacion(mesesUnidad);
            const metaUnidad = totalUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__") ?? 0;
            return <section key={`meses-${unidad.unidadNegocioId}`} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Distribución mensual · {nombreUnidad}</h3><span className={Math.abs(totalMeses - 100) > 0.011 ? "text-destructive" : "text-muted-foreground"}>Total: {totalMeses.toFixed(2)} %</span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{mesesUnidad.map((item) => <label key={item.mes} className="text-sm"><span className="mb-1 block text-muted-foreground">{MESES[item.mes - 1]}</span><div className="flex items-center gap-2"><Input aria-label={`Participación ${MESES[item.mes - 1]}`} type="number" min="0" max="100" step="0.01" value={item.participacion} onChange={(event) => actualizarMes(unidad.unidadNegocioId, item.mes, Number(event.target.value))} className="text-right" /><span>%</span><span className="min-w-24 text-right tabular-nums">{money(metaUnidad * item.participacion / 100)}</span></div></label>)}</div>
            </section>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Guardar revisión {targetAnio}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre de la revisión" aria-label="Nombre de la revisión" />
          <Button onClick={() => crear.mutate()} disabled={!puedeGuardar}>
            {crear.isPending ? "Guardando…" : esGerenteComercial ? "Enviar plan a Gerencia Nacional" : "Guardar propuesta"}
          </Button>
        </CardContent>
        {esGerenteComercial && <div className="px-6 pb-4">
          <label htmlFor="plan-comercial" className="mb-1 block text-sm font-medium">Plan comercial de la unidad</label>
          <Textarea id="plan-comercial" value={planTrabajo} onChange={(event) => setPlanTrabajo(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="Describe las iniciativas, oportunidades y acciones que respaldan la distribución propuesta…" aria-describedby="plan-comercial-ayuda" />
          <p id="plan-comercial-ayuda" className="mt-1 text-xs text-muted-foreground">Gerencia Nacional lo revisará antes de definir el % de Gestión Comercial. {planTrabajo.trim().length}/2.000 caracteres; mínimo 20.</p>
        </div>}
        {(crear.error || aprobar.error || proyeccion.error) && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{(crear.error ?? aprobar.error ?? proyeccion.error)?.message}</p>}
      </Card>

      <Card>
        <CardHeader><CardTitle>Versiones guardadas {targetAnio}</CardTitle></CardHeader>
        <CardContent>
          {versionesError && <QueryErrorNotice error={versionesErrorDetail} onRetry={() => void refetchVersiones()} fallback="No se pudieron cargar las versiones." />}
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-left"><th className="p-2">Nombre</th><th className="p-2">Estado</th><th className="p-2">Impacto anual</th><th className="p-2">Creado</th><th className="p-2" /></tr></thead>
              <tbody>
                {(versiones ?? []).map((version) => (
                  <tr key={version.id} className="border-b">
                    <td className="max-w-xl p-2"><div className="font-medium">{version.nombre}</div>{!esGerenteComercial && version.premisas?.unidadSolicitanteIds?.length ? <p className="mt-1 text-xs font-medium text-primary">{version.premisas.unidadSolicitanteIds.map((id) => { const unidad = unidades?.find((item) => item.id === id); return unidad ? unidadLabelInfo(unidad.nombre).label : "Unidad"; }).join(" · ")}</p> : null}{version.descripcion && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{version.descripcion}</p>}{!esGerenteComercial && version.premisas?.tipo === "plan_comercial_unidad" && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-primary">Ver distribución solicitada</summary><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs font-semibold">Participación por sucursal</p>{version.premisas.sucursales?.map((row) => <p key={`${row.unidadNegocioId}:${row.sucursalId}`} className="text-xs text-muted-foreground">{sucursalesCatalogo?.find((item) => item.id === row.sucursalId)?.nombre ?? "Sucursal"}: {row.participacion.toFixed(2)}%</p>)}</div><div><p className="mb-1 text-xs font-semibold">Participación mensual</p>{version.premisas.meses?.map((row) => <p key={`${row.unidadNegocioId}:${row.mes}`} className="text-xs text-muted-foreground">{MESES[row.mes - 1]}: {row.participacion.toFixed(2)}%</p>)}</div></div></details>}</td>
                    <td className="p-2">{version.premisas?.tipo === "plan_comercial_unidad" ? "Plan recibido" : ESTADO_LABEL[version.estado]}</td>
                    <td className="p-2 tabular-nums">
                      {version.premisas?.tipo === "plan_comercial_unidad" ? (
                        <span className="text-muted-foreground">Redistribución; conserva la meta</span>
                      ) : (() => {
                        const nuevaMeta = version.premisas?.metaTotalConGestion ?? version.premisas?.metaPropuesta;
                        if (nuevaMeta == null) return <span className="text-muted-foreground">Pendiente de proyección</span>;
                        const total = Number(nuevaMeta);
                        const delta = ultimaMetaAprobada === null ? null : total - ultimaMetaAprobada;
                        const variacion = ultimaMetaAprobada && ultimaMetaAprobada > 0 && delta !== null
                          ? (delta / ultimaMetaAprobada) * 100
                          : null;
                        return <><span className="font-medium">{money(total)}</span>{version.estado === "propuesto" && delta !== null && <span className={`ml-2 text-xs ${delta >= 0 ? "text-primary" : "text-destructive"}`}>{delta >= 0 ? "+" : "−"}{money(Math.abs(delta))}{variacion !== null ? ` · ${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)} %` : ""} vs. aprobada</span>}</>;
                      })()}
                    </td>
                    <td className="p-2">{new Date(version.createdAt).toLocaleDateString("es-VE")}</td>
                    <td className="p-2 text-right">{!esGerenteComercial && version.estado === "propuesto" && version.premisas?.tipo !== "plan_comercial_unidad" && <Button size="sm" onClick={() => aprobar.mutate(version.id)} disabled={aprobar.isPending}>{aprobar.isPending ? "Aprobando…" : "Aprobar"}</Button>}</td>
                  </tr>
                ))}
                {!versionesError && versiones?.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={5}>Sin revisiones guardadas para {targetAnio}.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalle por mes y sucursal</CardTitle><p className="text-sm text-muted-foreground">Desglose calculado por sucursal. Abre solo cuando necesites revisar cada mes.</p></CardHeader>
        <CardContent>
          <details>
            <summary className="mb-3 cursor-pointer text-sm font-medium text-primary">Ver detalle de {rows.length} asignaciones</summary>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-2">Mes</th><th className="p-2">Unidad</th><th className="p-2">Sucursal</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">Real</th><th className="p-2 text-right">Meta propuesta</th></tr></thead>
              <tbody>
                {rows.map((row, index) => <tr key={`${row.mes}-${row.unidadNegocioId}-${row.sucursalId}-${index}`} className="border-b">
                  <td className="p-2">{MESES[row.mes - 1] ?? row.mes}</td><td className="p-2">{row.unidad ?? "Sin unidad"}</td><td className="p-2">{row.sucursal ?? "Sin sucursal"}</td>
                  <td className="p-2 text-right">{money(Number(row.basePresupuesto))}</td><td className="p-2 text-right">{money(Number(row.realBase))}</td><td className="p-2 text-right font-medium">{money(Number(row.sugerido))}</td>
                </tr>)}
                {!proyeccion.isLoading && rows.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={6}>Corrige los porcentajes para ver la distribución calculada.</td></tr>}
              </tbody>
            </table>
          </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PresupuestosPage() {
  const { role } = useAuth();
  return role === "coordinador" ? <PresupuestoCoordinadorPage /> : <PresupuestoGerenciaPage />;
}
