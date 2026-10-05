import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  proyeccionVenta: {
    anio: number;
    ventaAcumulada: number;
    mesesConsiderados: number;
    metodo: "proyeccion" | "cierre" | "presupuesto";
  };
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
  creadorRol?: string | null;
  descripcion?: string | null;
  premisas?: {
    tipo?: string;
    crecimientoAnualPct?: number;
    versionPadreId?: string;
    metaPropuesta?: number | string;
    metaTotalConGestion?: number | string;
    montoGestionComercialTotal?: number | string;
    unidadSolicitanteIds?: string[];
    unidades?: ParticipacionUnidad[];
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

type PendingBudgetAction =
  | { kind: "save" }
  | { kind: "approve"; version: VersionRow };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function descripcionMetaBase(data: ProyeccionData) {
  const proyeccion = data.proyeccionVenta;
  if (proyeccion.metodo === "proyeccion") {
    return `${money(proyeccion.ventaAcumulada)} ÷ ${proyeccion.mesesConsiderados} × 12`;
  }
  if (proyeccion.metodo === "cierre") {
    return `Venta de cierre ${proyeccion.anio}: ${money(proyeccion.ventaAcumulada)}`;
  }
  return `Sin venta registrada; se usa el presupuesto ${proyeccion.anio}`;
}

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

function repartoEquitativo(count: number) {
  if (count <= 0) return [];
  const base = Math.floor(10000 / count);
  const remainder = 10000 - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debouncedValue;
}

function PresupuestoGerenciaPage() {
  const targetAnio = new Date().getFullYear();
  const baseAnio = targetAnio - 1;
  const queryClient = useQueryClient();
  const { role, profile } = useAuth();
  const esGerenteComercial = role === "gerente_comercial";
  const esDirector = role === "director";
  const puedeEditarDistribucionAnual = true;
  const puedeEditarCrecimiento = esDirector || role === "administrador";
  const unidadesAsignadas = profile?.unidades_negocio_ids?.length
    ? profile.unidades_negocio_ids
    : profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : [];
  const [nombre, setNombre] = useState(`Revisión presupuesto ${targetAnio}`);
  const [planTrabajo, setPlanTrabajo] = useState("");
  const [distribucion, setDistribucion] = useState<Distribucion | null>(null);
  const [distribucionGuardada, setDistribucionGuardada] = useState<Distribucion | null>(null);
  const [versionPadreId, setVersionPadreId] = useState<string | null>(null);
  const distribucionProyectada = useDebouncedValue(distribucion, 250);
  const [unidadSucursalActiva, setUnidadSucursalActiva] = useState<string | null>(null);
  const [busquedaSucursal, setBusquedaSucursal] = useState("");
  const [ordenSucursal, setOrdenSucursal] = useState<"meta" | "nombre" | "participacion">("meta");
  const [pendingBudgetAction, setPendingBudgetAction] = useState<PendingBudgetAction | null>(null);
  const [activeBudgetStage, setActiveBudgetStage] = useState(0);
  const previousBudgetStage = useRef(activeBudgetStage);
  const { data: unidades } = useUnidades();
  const { data: sucursalesCatalogo } = useSucursales();

  useEffect(() => {
    if (previousBudgetStage.current === activeBudgetStage) return;
    previousBudgetStage.current = activeBudgetStage;
    const stageId = esGerenteComercial
      ? ["unit-budget-summary", "unit-budget-stage-1", "unit-budget-stage-2", "unit-budget-submit"][activeBudgetStage]
      : ["budget-growth", "budget-branches", "budget-impact", "budget-review"][activeBudgetStage];
    document.getElementById(stageId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeBudgetStage, esGerenteComercial]);

  const proyeccion = useQuery<ProyeccionData>({
    queryKey: ["presupuestos", "distribucion", targetAnio, versionPadreId, JSON.stringify(distribucionProyectada)],
    queryFn: () => api("/presupuestos/proyeccion-anual", {
      method: "POST",
      body: JSON.stringify({ modo: "distribucion", baseAnio, targetAnio, ...(versionPadreId ? { versionPadreId } : {}), ...(distribucionProyectada ? { distribucion: esGerenteComercial ? { ...distribucionProyectada, crecimientoAnualPct: 0, unidades: [] } : distribucionProyectada } : {}) }),
    }),
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!distribucion && proyeccion.data?.distribucion) {
      setDistribucion(proyeccion.data.distribucion);
      setDistribucionGuardada(proyeccion.data.distribucion);
    }
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
  const propuestaGerenciaPendiente = role === "gerencia"
    ? versiones?.find((version) => version.estado === "propuesto" && version.creadorRol === "director" && version.premisas?.tipo === "participacion" && !versiones.some((child) => child.estado === "propuesto" && child.premisas?.versionPadreId === version.id))
    : undefined;
  const propuestaPorAprobar = !esGerenteComercial
    ? versiones?.find((version) => version.estado === "propuesto" && version.premisas?.tipo !== "plan_comercial_unidad" && !(role === "gerencia" && version.creadorRol === "director"))
    : undefined;

  const crear = useMutation({
    mutationFn: async () => {
      if (!distribucion) throw new Error("La distribución todavía está cargando.");
      const version = await api("/presupuestos/versiones", {
        method: "POST",
        body: JSON.stringify({ anio: targetAnio, baseAnio, nombre, escenario: "base", ...(esGerenteComercial ? { descripcion: planTrabajo.trim() } : {}), ...(versionPadreId ? { versionPadreId } : {}), distribucion: esGerenteComercial ? { ...distribucion, crecimientoAnualPct: 0, unidades: [] } : distribucion }),
      });
      if (esGerenteComercial) return version;
      return api(`/presupuestos/versiones/${version.id}/generar`, {
        method: "POST",
        body: JSON.stringify({ anio: baseAnio, distribucion: esGerenteComercial ? { ...distribucion, crecimientoAnualPct: 0, unidades: [] } : distribucion }),
      });
    },
    onSuccess: () => {
      setDistribucionGuardada(distribucion);
      setVersionPadreId(null);
      void queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] });
    },
  });

  const aprobar = useMutation({
    mutationFn: (id: string) => api(`/presupuestos/versiones/${id}/aprobar`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuestos", "versiones", targetAnio] }),
  });

  const data = proyeccion.data;
  const calculoPendiente = distribucion !== distribucionProyectada || proyeccion.isFetching;
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

  const iniciarCompletarPropuesta = (version: VersionRow) => {
    const premisas = version.premisas;
    if (premisas?.tipo !== "participacion" || !premisas.unidades || !premisas.sucursales || !premisas.meses) return;
    setNombre(`Completar ${version.nombre}`);
    setVersionPadreId(version.id);
    setDistribucion({
      crecimientoAnualPct: Number(premisas.crecimientoAnualPct ?? 0),
      unidades: premisas.unidades,
      sucursales: premisas.sucursales,
      meses: premisas.meses,
    });
    setDistribucionGuardada({
      crecimientoAnualPct: Number(premisas.crecimientoAnualPct ?? 0),
      unidades: premisas.unidades,
      sucursales: premisas.sucursales,
      meses: premisas.meses,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
  const puedeGuardar = !!distribucion && configLista && !calculoPendiente && !crear.isPending && !!nombre.trim() && (!esGerenteComercial || planTrabajo.trim().length >= 20);
  const sucursalesAfectadas = new Set((distribucion?.sucursales ?? []).map((item) => item.sucursalId).filter(Boolean)).size;
  const mesesAfectados = new Set((distribucion?.meses ?? []).map((item) => item.mes)).size;
  const metaConfirmacion = pendingBudgetAction?.kind === "approve"
    ? Number(pendingBudgetAction.version.premisas?.metaTotalConGestion ?? pendingBudgetAction.version.premisas?.metaPropuesta ?? 0)
    : data?.metaTotalConGestion ?? data?.metaPropuesta ?? null;
  const versionBaseConfirmacion = pendingBudgetAction?.kind === "approve"
    ? versiones?.find((version) => version.id === pendingBudgetAction.version.premisas?.versionPadreId)
    : null;
  const hayCambiosSinGuardar = !!distribucion && !!distribucionGuardada && JSON.stringify(distribucion) !== JSON.stringify(distribucionGuardada);
  const confirmDialog = (
    <AlertDialog open={pendingBudgetAction !== null} onOpenChange={(open) => { if (!open) setPendingBudgetAction(null); }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingBudgetAction?.kind === "approve" ? "Aprobar presupuesto" : "Confirmar propuesta de presupuesto"}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingBudgetAction?.kind === "approve"
              ? `Aprobarás “${pendingBudgetAction.version.nombre}” para ${targetAnio}. Si luego necesitas corregirla, podrás presentar una nueva revisión; las versiones anteriores quedan en el historial.`
              : esGerenteComercial
                ? `Enviarás la distribución de tu unidad a Gerencia Nacional. La meta anual aprobada de ${money(ultimaMetaAprobada ?? data?.metaBase ?? 0)} se conserva.`
                : `Guardarás “${nombre}” como propuesta para ${targetAnio}. La meta anual aprobada no se reduce.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">Meta que se revisa</dt><dd className="text-right font-semibold tabular-nums">{metaConfirmacion === null ? "—" : money(metaConfirmacion)}</dd>
          <dt className="text-muted-foreground">Unidades</dt><dd className="text-right tabular-nums">{pendingBudgetAction?.kind === "approve" ? pendingBudgetAction.version.premisas?.unidades?.length ?? pendingBudgetAction.version.premisas?.unidadSolicitanteIds?.length ?? 0 : unidadesVisibles.length}</dd>
          <dt className="text-muted-foreground">Sucursales</dt><dd className="text-right tabular-nums">{pendingBudgetAction?.kind === "approve" ? new Set(pendingBudgetAction.version.premisas?.sucursales?.map((item) => item.sucursalId).filter(Boolean)).size : sucursalesAfectadas}</dd>
          <dt className="text-muted-foreground">Meses incluidos</dt><dd className="text-right tabular-nums">{pendingBudgetAction?.kind === "approve" ? new Set(pendingBudgetAction.version.premisas?.meses?.map((item) => item.mes)).size : mesesAfectados}</dd>
          {ultimaMetaAprobada !== null && <><dt className="text-muted-foreground">Última meta aprobada</dt><dd className="text-right tabular-nums">{money(ultimaMetaAprobada)}</dd></>}
          {pendingBudgetAction?.kind === "save" && versionPadreId && <><dt className="text-muted-foreground">Propuesta del Director</dt><dd className="text-right">{versiones?.find((version) => version.id === versionPadreId)?.nombre ?? "Versión base"}</dd></>}
          {pendingBudgetAction?.kind === "approve" && pendingBudgetAction.version.premisas?.crecimientoAnualPct != null && <><dt className="text-muted-foreground">Crecimiento anual</dt><dd className="text-right tabular-nums">{Number(pendingBudgetAction.version.premisas.crecimientoAnualPct).toFixed(1)} %</dd></>}
          {pendingBudgetAction?.kind === "approve" && pendingBudgetAction.version.premisas?.versionPadreId && <><dt className="text-muted-foreground">Versión base</dt><dd className="text-right">{versionBaseConfirmacion?.nombre ?? "Versión anterior"}</dd></>}
        </dl>
        <p className="text-xs text-muted-foreground">{pendingBudgetAction?.kind === "approve" ? "Revisa el período y el alcance antes de confirmar. La aprobación se conserva en el historial de versiones." : `Alcance de tu rol: ${esGerenteComercial ? "solo las unidades de negocio asignadas a tu perfil" : esDirector ? "crecimiento anual y distribución general" : "distribución general de las unidades y sucursales"}. Puedes volver al formulario antes de enviarlo.`}</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={crear.isPending || aprobar.isPending}>Volver a revisar</AlertDialogCancel>
          <AlertDialogAction disabled={crear.isPending || aprobar.isPending} onClick={() => {
            const action = pendingBudgetAction;
            setPendingBudgetAction(null);
            if (action?.kind === "approve") aprobar.mutate(action.version.id);
            else if (action?.kind === "save") crear.mutate();
          }}>{crear.isPending || aprobar.isPending ? "Procesando…" : pendingBudgetAction?.kind === "approve" ? "Confirmar aprobación" : esGerenteComercial ? "Enviar propuesta" : "Guardar propuesta"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (esGerenteComercial) {
    return (
      <div className="ccv-budget-page ccv-budget-unit-view space-y-6">
        <PageHeader
          eyebrow="Planeación comercial"
          title={`Presupuesto ${targetAnio}`}
          description="Distribuye la meta asignada a tu unidad entre sucursales y meses. Gerencia Nacional conserva la meta anual y aprueba los cambios."
        />

        {versionPadreId && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4" role="status">
          <p className="font-semibold">Estás editando la distribución de una meta nacional</p>
          <p className="mt-1 text-sm text-muted-foreground">Tu propuesta solo redistribuye la meta aprobada entre tus sucursales y meses; no cambia el monto anual asignado.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setVersionPadreId(null); setDistribucion(null); }}>Descartar esta revisión</Button>
        </div>}

        {proyeccion.isLoading && <p className="text-sm text-muted-foreground" role="status">Calculando la propuesta inicial…</p>}
        {calculoPendiente && !proyeccion.isLoading && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Recalculando el impacto de los cambios…</p>}
        {proyeccion.isError && <QueryErrorNotice error={proyeccion.error} onRetry={() => void proyeccion.refetch()} fallback="No se pudo calcular el impacto del presupuesto." />}

        <nav aria-label="Etapas del presupuesto" className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4 sm:p-4">
          {["Meta asignada", "Distribución por sucursal", "Distribución mensual", "Presentar y revisar"].map((etapa, index) => (
            <button key={etapa} type="button" aria-current={activeBudgetStage === index ? "step" : undefined} onClick={() => setActiveBudgetStage(index)} className={`flex items-center gap-2 rounded-lg p-2 text-left text-xs transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${activeBudgetStage === index ? "bg-primary/10 text-primary" : "text-foreground"}`}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono font-semibold text-primary">{index + 1}</span>
              <span className="font-medium">{etapa}</span>
            </button>
          ))}
        </nav>

        {activeBudgetStage === 0 && <Card id="unit-budget-summary" className="scroll-mt-28">
          <CardHeader><CardTitle>Meta aprobada para tu unidad</CardTitle><p className="text-sm text-muted-foreground">La meta anual está definida por Gerencia Nacional. En esta pantalla solo distribuyes ese monto por sucursal y por mes.</p></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {unidadesVisibles.map((unidad) => {
              const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
              const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : "Unidad";
              const metaUnidad = totalUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__") ?? 0;
              return <section key={unidad.unidadNegocioId ?? "sin-unidad"} className="rounded-lg border p-4"><h3 className="font-semibold">{nombreUnidad}</h3><p className="mt-2 text-2xl font-semibold tabular-nums">{money(metaUnidad)}</p><p className="mt-1 text-xs text-muted-foreground">Monto anual asignado</p></section>;
            })}
            {unidadesVisibles.length === 0 && <p className="text-sm text-muted-foreground">Tu perfil no tiene unidades de negocio asignadas.</p>}
          </CardContent>
        </Card>}

        {activeBudgetStage === 1 || activeBudgetStage === 2 ? <Card id={`unit-budget-stage-${activeBudgetStage}`} className="scroll-mt-24">
          <CardHeader><CardTitle>{activeBudgetStage === 1 ? "Distribución por sucursal" : "Distribución mensual"}</CardTitle><p className="text-sm text-muted-foreground">{activeBudgetStage === 1 ? "Asigna el porcentaje de la meta anual a cada sucursal. La suma debe ser 100 %." : "Distribuye el monto anual de la unidad entre los meses. La suma mensual debe ser 100 %."}</p></CardHeader>
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

                  {activeBudgetStage === 1 && <><div className="hidden overflow-auto sm:block">
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
                  <div className="space-y-2 sm:hidden" aria-label={`Asignación por sucursal de ${nombreUnidad}`}>
                    {sucursalesUnidad.map((sucursal) => <div key={sucursal.sucursalId ?? sucursal.nombre} className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                      <p className="col-span-2 font-medium">{sucursal.nombre}</p>
                      <label className="text-xs text-muted-foreground">Participación (%)<Input aria-label={`Participación ${sucursal.nombre} en ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={sucursal.participacion} onChange={(event) => actualizarSucursal(unidad.unidadNegocioId, sucursal.sucursalId, Number(event.target.value))} className="mt-1 text-right" /></label>
                      <div className="text-right"><p className="text-xs text-muted-foreground">Presupuesto anual</p><p className="mt-2 font-medium tabular-nums">{money(metaUnidad * sucursal.participacion / 100)}</p></div>
                    </div>)}
                  </div></>}

                  {activeBudgetStage === 2 && <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Distribución mensual</h4><Button type="button" variant="outline" size="sm" onClick={() => setDistribucion((actual) => actual ? { ...actual, meses: actual.meses.map((item) => item.unidadNegocioId !== unidad.unidadNegocioId ? item : { ...item, participacion: repartoEquitativo(mesesUnidad.length)[mesesUnidad.findIndex((month) => month.mes === item.mes)] ?? item.participacion }) } : actual)} disabled={!mesesUnidad.length}>Repartir meses por igual</Button></div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{mesesUnidad.map((item) => (
                      <label key={item.mes} className="text-sm"><span className="mb-1 block text-muted-foreground">{MESES[item.mes - 1]}</span><div className="flex items-center gap-2"><Input aria-label={`Participación ${MESES[item.mes - 1]} de ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={item.participacion} onChange={(event) => actualizarMes(unidad.unidadNegocioId, item.mes, Number(event.target.value))} className="text-right" /><span>%</span><span className="min-w-24 text-right tabular-nums">{money(metaUnidad * item.participacion / 100)}</span></div></label>
                    ))}</div>
                  </div>}
                </section>
              );
            })}
            {erroresVisibles.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
          </CardContent>
        </Card> : null}

        {activeBudgetStage === 3 && <Card id="unit-budget-submit" className="scroll-mt-24">
          <CardHeader><CardTitle>Presentar plan de distribución</CardTitle><p className="text-sm text-muted-foreground">La propuesta queda pendiente de revisión. No cambia la meta anual aprobada.</p></CardHeader>
          <CardContent className="space-y-3">
            <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre de la revisión" aria-label="Nombre de la revisión" />
            <div><label htmlFor="plan-comercial" className="mb-1 block text-sm font-medium">Justificación y plan comercial</label><Textarea id="plan-comercial" value={planTrabajo} onChange={(event) => setPlanTrabajo(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="Describe las acciones que respaldan la distribución propuesta…" aria-describedby="plan-comercial-ayuda" /><p id="plan-comercial-ayuda" className="mt-1 text-xs text-muted-foreground">Mínimo 20 caracteres. {planTrabajo.trim().length}/2.000</p></div>
            <Button onClick={() => setPendingBudgetAction({ kind: "save" })} disabled={!puedeGuardar}>{crear.isPending ? "Presentando…" : "Presentar propuesta"}</Button>
          </CardContent>
          {crear.error && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{crear.error.message}</p>}
          {crear.isSuccess && <p role="status" className="px-6 pb-4 text-sm text-success">Plan enviado. Gerencia Nacional lo revisará antes de cambiar la distribución aprobada.</p>}
        </Card>}

        {activeBudgetStage === 3 && <Card>
          <CardHeader><CardTitle>Mis propuestas · {targetAnio}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {versionesError && <QueryErrorNotice error={versionesErrorDetail} onRetry={() => void refetchVersiones()} fallback="No se pudieron cargar tus propuestas." />}
            {(versiones ?? []).map((version) => <div key={version.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{version.nombre}</span><span className="text-sm text-muted-foreground">{ESTADO_LABEL[version.estado]}</span></div>{version.descripcion && <p className="mt-2 text-sm text-muted-foreground">{version.descripcion}</p>}</div>)}
            {!versionesError && versiones?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay propuestas.</p>}
          </CardContent>
        </Card>}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="ccv-budget-page ccv-budget-national-view space-y-6">
      <PageHeader
        eyebrow="Planeación"
        title={`Presupuesto ${targetAnio}`}
          description={esDirector ? "Define el crecimiento y revisa o corrige la distribución general por unidad y sucursal." : "Define pesos por unidad y Gestión Comercial; revisa y corrige el reparto general por sucursal."}
      />

      {proyeccion.isLoading && <p className="text-sm text-muted-foreground" role="status">Calculando la propuesta inicial…</p>}
      {calculoPendiente && !proyeccion.isLoading && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Recalculando el impacto de los cambios…</p>}
      {proyeccion.isError && <QueryErrorNotice error={proyeccion.error} onRetry={() => void proyeccion.refetch()} fallback="No se pudo calcular el impacto del presupuesto." />}

      <nav aria-label="Etapas del presupuesto" className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4 sm:p-4">
        {(esDirector ? ["Define crecimiento", "Ajusta unidades y sucursales", "Revisa la meta", "Aprueba versión"] : ["Asigna pesos y gestión", "Distribuye sucursales", "Revisa impacto", "Aprueba versión"]
        ).map((etapa, index) => (
          <button key={etapa} type="button" aria-current={activeBudgetStage === index ? "step" : undefined} onClick={() => setActiveBudgetStage(index)} className={`flex items-center gap-2 rounded-lg p-2 text-left text-xs transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${activeBudgetStage === index ? "bg-primary/10 text-primary" : "text-foreground"}`}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono font-semibold text-primary">{index + 1}</span>
            <span className="font-medium">{etapa}</span>
          </button>
        ))}
      </nav>

      {propuestaGerenciaPendiente && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="pending-budget-title">
        <div><h2 id="pending-budget-title" className="font-semibold">Propuesta del Director pendiente de completar</h2><p className="mt-1 text-sm text-muted-foreground">{propuestaGerenciaPendiente.nombre} · crecimiento y meta del Director se conservarán.</p></div>
        <Button type="button" onClick={() => iniciarCompletarPropuesta(propuestaGerenciaPendiente)}>Completar propuesta</Button>
      </section>}
      {propuestaPorAprobar && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/5 p-4" aria-labelledby="pending-approval-title">
        <div><h2 id="pending-approval-title" className="font-semibold">Presupuesto pendiente de aprobación</h2><p className="mt-1 text-sm text-muted-foreground">{propuestaPorAprobar.nombre} · {money(Number(propuestaPorAprobar.premisas?.metaTotalConGestion ?? propuestaPorAprobar.premisas?.metaPropuesta ?? 0))} · {new Date(propuestaPorAprobar.createdAt).toLocaleDateString("es-VE")}</p></div>
        <Button type="button" onClick={() => setPendingBudgetAction({ kind: "approve", version: propuestaPorAprobar })}>Revisar y aprobar</Button>
      </section>}

      <section aria-label="Resumen de meta anual" className="grid scroll-mt-24 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:sticky lg:top-[76px] lg:z-10 lg:shadow-sm">
        <div><p className="text-xs text-muted-foreground">Meta base proyectada</p><p className="font-semibold tabular-nums">{data ? money(data.metaBase) : "Calculando…"}</p></div>
        <div><p className="text-xs text-muted-foreground">Meta propuesta</p><p className="font-semibold text-primary tabular-nums">{data ? money(data.metaTotalConGestion) : "Calculando…"}</p></div>
        <div><p className="text-xs text-muted-foreground">Última meta aprobada · piso</p><p className="font-semibold tabular-nums">{ultimaMetaAprobada === null ? "Aún no hay aprobación" : money(ultimaMetaAprobada)}</p></div>
      </section>

      {activeBudgetStage === 0 && !esGerenteComercial && <Card id="budget-growth" className="scroll-mt-28">
        <CardHeader><CardTitle>Revisión de la meta anual</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Meta base</label>
            <div className="h-9 content-center text-lg font-semibold">{data ? money(data.metaBase) : "Cargando…"}</div>
            <p className="text-xs text-muted-foreground">{data ? descripcionMetaBase(data) : `Proyección de ventas ${baseAnio}`}</p>
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
              disabled={!puedeEditarCrecimiento}
              onChange={(event) => actualizarCrecimiento(Number(event.target.value))}
            />
            {!puedeEditarCrecimiento && <p className="mt-1 text-xs text-muted-foreground">El crecimiento anual lo define Dirección.</p>}
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

      {activeBudgetStage === 0 && !esGerenteComercial && puedeEditarDistribucionAnual && <Card id="budget-units" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>Participación por unidad de negocio</CardTitle>
          <p className="text-sm text-muted-foreground">El <strong>peso de unidad (%)</strong> reparte la meta base entre unidades. <strong>Gestión Comercial (%)</strong> calcula el monto adicional durante la primera generación; después de aprobarse, ese monto queda fijo en moneda en las revisiones posteriores.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setDistribucion((actual) => actual ? { ...actual, unidades: actual.unidades.map((unidad, index, unidades) => ({ ...unidad, participacion: repartoEquitativo(unidades.length)[index] ?? 0 })) } : actual)} disabled={!distribucion?.unidades.length}>Repartir peso de unidades por igual</Button>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-auto sm:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-2">Unidad de negocio</th><th className="p-2 text-right">Peso de unidad (%)</th><th className="p-2 text-right">Meta base</th><th className="p-2 text-right">Gestión Comercial (%)</th><th className="p-2 text-right">Monto de gestión comercial</th><th className="p-2 text-right">Total asignado</th></tr></thead>
              <tbody>
                {distribucion?.unidades.map((unidad) => {
                  const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
                  const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : (unidad.unidadNegocioId ? "Unidad" : "Sin unidad asignada");
                  const total = resumenUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__");
                  const montoFijado = unidad.gestionComercialMonto !== null;
                  return (
                    <tr key={unidad.unidadNegocioId ?? "sin-unidad"} className="border-b">
                      <td className="p-2 font-medium">{nombreUnidad}</td>
                      <td className="w-36 p-2"><Input aria-label={`Peso de unidad ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={unidad.participacion} onChange={(event) => actualizarUnidad(unidad.unidadNegocioId, Number(event.target.value))} className="text-right" /></td>
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
          <div className="space-y-2 sm:hidden" aria-label="Participación por unidad de negocio">
            {distribucion?.unidades.map((unidad) => {
              const info = unidades?.find((item) => item.id === unidad.unidadNegocioId);
              const nombreUnidad = info ? unidadLabelInfo(info.nombre).label : "Unidad";
              const total = resumenUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__");
              const montoFijado = unidad.gestionComercialMonto !== null;
              return <section key={unidad.unidadNegocioId ?? "sin-unidad"} className="space-y-3 rounded-lg border p-3">
                <h3 className="font-semibold">{nombreUnidad}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-muted-foreground">Peso de unidad (%)<Input aria-label={`Peso de unidad ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={unidad.participacion} onChange={(event) => actualizarUnidad(unidad.unidadNegocioId, Number(event.target.value))} className="mt-1 text-right" /></label>
                  <div className="text-right"><p className="text-xs text-muted-foreground">Meta base</p><p className="mt-2 tabular-nums">{money(total?.metaBase ?? 0)}</p></div>
                  <label className="text-xs text-muted-foreground">Gestión Comercial (%)<Input aria-label={`Porcentaje de Gestión Comercial ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={unidad.gestionComercialPct} disabled={montoFijado} onChange={(event) => actualizarGestionComercial(unidad.unidadNegocioId, Number(event.target.value))} className="mt-1 text-right" /></label>
                  <div className="text-right"><p className="text-xs text-muted-foreground">Monto de gestión{montoFijado ? " · fijo" : ""}</p><p className="mt-2 tabular-nums">{money(unidad.gestionComercialMonto ?? total?.gestionComercialMonto ?? 0)}</p></div>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm"><span>Total asignado</span><strong className="tabular-nums">{money(total?.metaTotal ?? totalUnidad.get(unidad.unidadNegocioId ?? "__sin_unidad__") ?? 0)}</strong></div>
              </section>;
            })}
            <p className={`text-right text-sm font-semibold ${Math.abs(sumaParticipacion(distribucion?.unidades ?? []) - 100) > 0.011 ? "text-destructive" : "text-primary"}`}>Total peso de unidad: {sumaParticipacion(distribucion?.unidades ?? []).toFixed(2)} %</p>
          </div>
        </CardContent>
      </Card>}

      {activeBudgetStage === 1 && <Card id="budget-branches" className="scroll-mt-28">
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
              {!esGerenteComercial && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setDistribucion((actual) => actual ? { ...actual, sucursales: actual.sucursales.map((item) => item.unidadNegocioId !== idUnidadActiva ? item : { ...item, participacion: repartoEquitativo(participacionUnidad.length)[participacionUnidad.findIndex((target) => target.sucursalId === item.sucursalId)] ?? item.participacion }) } : actual)} disabled={!participacionUnidad.length}>Repartir sucursales por igual</Button>}
              <div className="hidden overflow-auto rounded-lg border sm:block">
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
              <div className="space-y-2 sm:hidden" aria-label={`Participación de sucursales de ${nombreUnidad}`}>
                {sucursalesFiltradas.map((sucursal) => {
                  const variacion = sucursal.base > 0 ? (sucursal.meta / sucursal.base - 1) * 100 : null;
                  return <section key={`${sucursal.unidadNegocioId}:${sucursal.sucursalId}`} className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                    <h3 className="col-span-2 font-medium">{sucursal.nombre}</h3>
                    <div><p className="text-xs text-muted-foreground">Base {baseAnio}</p><p className="tabular-nums">{money(sucursal.base)}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">Venta real {baseAnio}</p><p className="tabular-nums">{money(sucursal.real)}</p></div>
                    <label className="text-xs text-muted-foreground">Participación (%)<Input aria-label={`Participación ${sucursal.nombre} en ${nombreUnidad}`} type="number" min="0" max="100" step="0.01" value={sucursal.participacion} onChange={(event) => actualizarSucursal(sucursal.unidadNegocioId, sucursal.sucursalId, Number(event.target.value))} className="mt-1 text-right" /></label>
                    <div className="text-right"><p className="text-xs text-muted-foreground">Meta {targetAnio}</p><p className="mt-2 font-semibold tabular-nums">{money(sucursal.meta)}</p><p className="text-xs text-muted-foreground">{variacion === null ? "Sucursal nueva" : `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)} % vs. base`}</p></div>
                  </section>;
                })}
                {sucursalesFiltradas.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No hay sucursales que coincidan con la búsqueda.</p>}
                <p className="text-right text-xs font-medium text-muted-foreground">Participación total de la unidad: {totalPct.toFixed(2)} %</p>
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Distribución mensual · {nombreUnidad}</h3><span className={Math.abs(totalMeses - 100) > 0.011 ? "text-destructive" : "text-muted-foreground"}>Total: {totalMeses.toFixed(2)} %</span><Button type="button" variant="outline" size="sm" onClick={() => setDistribucion((actual) => actual ? { ...actual, meses: actual.meses.map((item) => item.unidadNegocioId !== unidad.unidadNegocioId ? item : { ...item, participacion: repartoEquitativo(mesesUnidad.length)[mesesUnidad.findIndex((month) => month.mes === item.mes)] ?? item.participacion }) } : actual)} disabled={!mesesUnidad.length}>Repartir meses por igual</Button></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{mesesUnidad.map((item) => <label key={item.mes} className="text-sm"><span className="mb-1 block text-muted-foreground">{MESES[item.mes - 1]}</span><div className="flex items-center gap-2"><Input aria-label={`Participación ${MESES[item.mes - 1]}`} type="number" min="0" max="100" step="0.01" value={item.participacion} onChange={(event) => actualizarMes(unidad.unidadNegocioId, item.mes, Number(event.target.value))} className="text-right" /><span>%</span><span className="min-w-24 text-right tabular-nums">{money(metaUnidad * item.participacion / 100)}</span></div></label>)}</div>
            </section>;
          })}
        </CardContent>
      </Card>}

      {activeBudgetStage === 3 && <Card id="budget-review" className="scroll-mt-28">
        <CardHeader><CardTitle>Guardar revisión {targetAnio}</CardTitle><p className="text-sm text-muted-foreground">La propuesta no cambia una versión aprobada hasta recibir aprobación del nivel autorizado.</p></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre de la revisión" aria-label="Nombre de la revisión" />
          {hayCambiosSinGuardar && <Button type="button" variant="outline" onClick={() => setDistribucion(distribucionGuardada)} disabled={crear.isPending || !distribucionGuardada}>Descartar cambios</Button>}
          <Button onClick={() => setPendingBudgetAction({ kind: "save" })} disabled={!puedeGuardar}>
            {crear.isPending ? "Guardando…" : esGerenteComercial ? "Enviar plan a Gerencia Nacional" : "Guardar propuesta"}
          </Button>
        </CardContent>
        {esGerenteComercial && <div className="px-6 pb-4">
          <label htmlFor="plan-comercial" className="mb-1 block text-sm font-medium">Plan comercial de la unidad</label>
          <Textarea id="plan-comercial" value={planTrabajo} onChange={(event) => setPlanTrabajo(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="Describe las iniciativas, oportunidades y acciones que respaldan la distribución propuesta…" aria-describedby="plan-comercial-ayuda" />
          <p id="plan-comercial-ayuda" className="mt-1 text-xs text-muted-foreground">Gerencia Nacional lo revisará antes de definir el % de Gestión Comercial. {planTrabajo.trim().length}/2.000 caracteres; mínimo 20.</p>
        </div>}
        {(crear.error || aprobar.error) && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{(crear.error ?? aprobar.error)?.message}</p>}
      </Card>}
      {crear.isSuccess && !hayCambiosSinGuardar && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">Propuesta guardada. Ya aparece en el historial y espera la revisión del siguiente nivel.</p>}
      {aprobar.isSuccess && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">Presupuesto aprobado. La nueva versión ya está registrada.</p>}

      {activeBudgetStage === 3 && <Card>
        <CardHeader><CardTitle>Versiones guardadas {targetAnio}</CardTitle></CardHeader>
        <CardContent>
          {versionesError && <QueryErrorNotice error={versionesErrorDetail} onRetry={() => void refetchVersiones()} fallback="No se pudieron cargar las versiones." />}
          <div className="space-y-3 sm:hidden" aria-label={`Versiones de presupuesto ${targetAnio}`}>
            {(versiones ?? []).map((version) => {
              const proposalTotal = version.premisas?.metaTotalConGestion ?? version.premisas?.metaPropuesta;
              const needsCompletion = role === "gerencia" && version.estado === "propuesto" && version.creadorRol === "director" && version.premisas?.tipo === "participacion" && !versiones?.some((child) => child.estado === "propuesto" && child.premisas?.versionPadreId === version.id);
              const canApprove = !esGerenteComercial && version.estado === "propuesto" && version.premisas?.tipo !== "plan_comercial_unidad" && !(role === "gerencia" && version.creadorRol === "director");
              return <article key={version.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{version.nombre}</h3><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">{version.premisas?.tipo === "plan_comercial_unidad" ? "Plan recibido" : ESTADO_LABEL[version.estado]}</span></div>
                {proposalTotal != null && <p className="text-lg font-semibold tabular-nums">{money(Number(proposalTotal))}<span className="ml-2 text-xs font-normal text-muted-foreground">impacto anual</span></p>}
                <p className="text-xs text-muted-foreground">Creada {new Date(version.createdAt).toLocaleDateString("es-VE")}{version.premisas?.unidadSolicitanteIds?.length ? ` · ${version.premisas.unidadSolicitanteIds.map((id) => { const unit = unidades?.find((item) => item.id === id); return unit ? unidadLabelInfo(unit.nombre).label : "Unidad"; }).join(" · ")}` : ""}</p>
                {version.descripcion && <p className="text-sm text-muted-foreground">{version.descripcion}</p>}
                <details><summary className="cursor-pointer text-sm font-medium text-primary">Ver impacto y distribución</summary><div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><p>Unidades: {version.premisas?.unidades?.length ?? version.premisas?.unidadSolicitanteIds?.length ?? 0}</p><p>Sucursales: {new Set(version.premisas?.sucursales?.map((item) => item.sucursalId).filter(Boolean)).size}</p><p>Meses: {new Set(version.premisas?.meses?.map((item) => item.mes)).size}</p><p>Meta: {proposalTotal == null ? "Pendiente" : money(Number(proposalTotal))}</p></div></details>
                {needsCompletion && <Button size="sm" variant="outline" onClick={() => iniciarCompletarPropuesta(version)}>Completar mi nivel</Button>}
                {canApprove && <Button size="sm" onClick={() => setPendingBudgetAction({ kind: "approve", version })} disabled={aprobar.isPending}>{aprobar.isPending ? "Aprobando…" : "Aprobar"}</Button>}
              </article>;
            })}
            {!versionesError && versiones?.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Sin revisiones guardadas para {targetAnio}.</p>}
          </div>
          <div className="hidden overflow-auto sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b text-left"><th className="p-2">Nombre</th><th className="p-2">Estado</th><th className="p-2">Meta anual propuesta</th><th className="p-2">Creado</th><th className="p-2" /></tr></thead>
              <tbody>
                {(versiones ?? []).map((version) => (
                  <tr key={version.id} className="border-b">
                    <td className="max-w-xl p-2"><div className="font-medium">{version.nombre}</div>{!esGerenteComercial && version.premisas?.unidadSolicitanteIds?.length ? <p className="mt-1 text-xs font-medium text-primary">{version.premisas.unidadSolicitanteIds.map((id) => { const unidad = unidades?.find((item) => item.id === id); return unidad ? unidadLabelInfo(unidad.nombre).label : "Unidad"; }).join(" · ")}</p> : null}{version.descripcion && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{version.descripcion}</p>}{!esGerenteComercial && version.premisas?.tipo === "participacion" && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-primary">Ver distribución y premisas</summary><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs font-semibold">Unidad · peso · gestión comercial</p>{version.premisas.unidades?.map((row) => { const unidad = unidades?.find((item) => item.id === row.unidadNegocioId); return <p key={row.unidadNegocioId ?? "sin-unidad"} className="text-xs text-muted-foreground">{unidad ? unidadLabelInfo(unidad.nombre).label : "Unidad"}: {row.participacion.toFixed(2)}% · GC {row.gestionComercialPct.toFixed(2)}%</p>; })}</div><div><p className="mb-1 text-xs font-semibold">Distribución por sucursal y mes</p>{version.premisas.sucursales?.map((row) => <p key={`${row.unidadNegocioId}:${row.sucursalId}`} className="text-xs text-muted-foreground">{sucursalesCatalogo?.find((item) => item.id === row.sucursalId)?.nombre ?? "Sucursal"}: {row.participacion.toFixed(2)}%</p>)}{version.premisas.meses?.map((row) => <p key={`${row.unidadNegocioId}:${row.mes}`} className="text-xs text-muted-foreground">{MESES[row.mes - 1]}: {row.participacion.toFixed(2)}%</p>)}</div></div></details>}{!esGerenteComercial && version.premisas?.tipo === "plan_comercial_unidad" && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-primary">Ver distribución solicitada</summary><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs font-semibold">Participación por sucursal</p>{version.premisas.sucursales?.map((row) => <p key={`${row.unidadNegocioId}:${row.sucursalId}`} className="text-xs text-muted-foreground">{sucursalesCatalogo?.find((item) => item.id === row.sucursalId)?.nombre ?? "Sucursal"}: {row.participacion.toFixed(2)}%</p>)}</div><div><p className="mb-1 text-xs font-semibold">Participación mensual</p>{version.premisas.meses?.map((row) => <p key={`${row.unidadNegocioId}:${row.mes}`} className="text-xs text-muted-foreground">{MESES[row.mes - 1]}: {row.participacion.toFixed(2)}%</p>)}</div></div></details>}</td>
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
                    <td className="p-2 text-right">{role === "gerencia" && version.estado === "propuesto" && version.creadorRol === "director" && version.premisas?.tipo === "participacion" && (() => {
                      const hijaPendiente = versiones?.some((item) => item.estado === "propuesto" && item.premisas?.versionPadreId === version.id);
                      return hijaPendiente
                        ? <span className="text-xs text-muted-foreground">Revisión de Gerencia pendiente</span>
                        : <Button size="sm" variant="outline" onClick={() => iniciarCompletarPropuesta(version)}>Completar mi nivel</Button>;
                    })()}{!esGerenteComercial && version.estado === "propuesto" && version.premisas?.tipo !== "plan_comercial_unidad" && !(role === "gerencia" && version.creadorRol === "director") && <Button size="sm" onClick={() => setPendingBudgetAction({ kind: "approve", version })} disabled={aprobar.isPending}>{aprobar.isPending ? "Aprobando…" : "Aprobar"}</Button>}</td>
                  </tr>
                ))}
                {!versionesError && versiones?.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={5}>Sin revisiones guardadas para {targetAnio}.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>}

      {activeBudgetStage === 2 && <Card id="budget-impact" className="scroll-mt-24">
        <CardHeader><CardTitle>Detalle por mes y sucursal</CardTitle><p className="text-sm text-muted-foreground">Desglose calculado por sucursal. Abre solo cuando necesites revisar cada mes.</p></CardHeader>
        <CardContent>
          <details>
            <summary className="mb-3 cursor-pointer text-sm font-medium text-primary">Ver detalle de {rows.length} asignaciones</summary>
          <div className="hidden max-h-96 overflow-auto sm:block">
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
          <div className="max-h-96 space-y-2 overflow-auto sm:hidden" aria-label="Detalle mensual de presupuesto">
            {rows.map((row, index) => <article key={`${row.mes}-${row.unidadNegocioId}-${row.sucursalId}-${index}`} className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex justify-between gap-3"><div><h3 className="font-medium">{row.sucursal ?? "Sin sucursal"}</h3><p className="text-xs text-muted-foreground">{row.unidad ?? "Sin unidad"} · {MESES[row.mes - 1] ?? row.mes}</p></div><p className="font-semibold tabular-nums">{money(Number(row.sugerido))}</p></div>
              <div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs"><p className="text-muted-foreground">Base: <span className="text-foreground tabular-nums">{money(Number(row.basePresupuesto))}</span></p><p className="text-right text-muted-foreground">Real: <span className="text-foreground tabular-nums">{money(Number(row.realBase))}</span></p></div>
            </article>)}
            {!proyeccion.isLoading && rows.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Corrige los porcentajes para ver la distribución calculada.</p>}
          </div>
          </details>
        </CardContent>
      </Card>}
      {confirmDialog}
    </div>
  );
}

export default function PresupuestosPage() {
  const { role } = useAuth();
  return role === "coordinador" ? <PresupuestoCoordinadorPage /> : <PresupuestoGerenciaPage />;
}
