"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  generarAnalisisNarrativoAction,
  getGestionAsesoresAction,
  getReporteCumplimientoAction,
  type ReporteFiltros,
} from "@/lib/actions/evaluacion";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { BranchRanking } from "@/components/gerencia-nacional/BranchRanking";
import { UnitDonut } from "@/components/gerencia-nacional/UnitDonut";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { money, pct, statusFromPct90, MESES } from "@/lib/format";
import { cn } from "@/lib/utils";

const anioActual = new Date().getFullYear();

/**
 * Qué selectores mostrar/bloquear por rol, según lo pedido por el usuario
 * 2026-09-03:
 * - gerencia/admin: todo libre (mes, sucursal, unidad).
 * - gerente_comercial: unidad fija a la suya, sucursal y mes libres.
 * - coordinador: sucursal fija a la suya, unidad y mes libres.
 * - asesor: siempre su propia información -- solo elige mes y/o unidad.
 */
function permisosFiltro(role: string | null) {
  return {
    puedeElegirSucursal: role === "gerencia" || role === "gerente_comercial",
    puedeElegirUnidad: role !== "gerente_comercial",
    esAsesor: role === "asesor",
    // Análisis de gestión (cotizado/facturado/perdido) por asesor -- nunca
    // visible para el propio asesor, pedido explícito del usuario 2026-09-03.
    puedeVerGestionAsesores: role === "gerencia" || role === "gerente_comercial" || role === "coordinador",
  };
}

function ToggleChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function HallazgoCard({ tipo, titulo, texto }: { tipo: "good" | "bad" | "warn"; titulo: string; texto: string }) {
  const estilos = {
    good: "border-success/30 bg-success/5",
    bad: "border-danger/30 bg-danger/5",
    warn: "border-warning/30 bg-warning/5",
  } as const;
  const textoTitulo = {
    good: "text-success",
    bad: "text-danger",
    warn: "text-warning",
  } as const;
  return (
    <div className={cn("rounded-2xl border p-4", estilos[tipo])}>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", textoTitulo[tipo])}>{titulo}</p>
      <p className="mt-1.5 text-sm leading-snug text-foreground">{texto}</p>
    </div>
  );
}

/** Top 4 marcas + "Otra marca" con la suma de todo lo que quede debajo -- pedido
 * del usuario 2026-09-04 para no listar 10+ marcas de cola larga en la card. */
function agruparTop4MasOtras(filas: { marca: string; monto: number }[]): { marca: string; monto: number }[] {
  if (filas.length <= 5) return filas;
  const top4 = filas.slice(0, 4);
  const resto = filas.slice(4).reduce((s, f) => s + f.monto, 0);
  return resto > 0 ? [...top4, { marca: "Otra marca", monto: resto }] : top4;
}

function MarcaBarCard({ titulo, filas: filasCrudas }: { titulo: string; filas: { marca: string; monto: number }[] }) {
  const filas = agruparTop4MasOtras(filasCrudas);
  const max = Math.max(...filas.map((f) => f.monto), 1);
  return (
    <div className="card-elevated p-4">
      <h3 className="mb-4 font-display text-sm font-semibold">{titulo}</h3>
      <div className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <div key={f.marca} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs font-medium" title={f.marca}>
              {f.marca}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/8">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, (f.monto / max) * 100)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {money(f.monto)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EvaluacionPage() {
  const { role, profile } = useAuth();
  const permisos = permisosFiltro(role);

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  // Estado inicial desde la URL -- así la exportación headless (Playwright,
  // ver /api/evaluacion/pdf) puede navegar a /evaluacion?meses=8,9&... y
  // reproducir exactamente los mismos filtros que el usuario eligió en pantalla.
  const searchParams = useSearchParams();
  const parseListParam = (valor: string | null): string[] =>
    valor ? valor.split(",").filter(Boolean) : [];

  // Default = mes en curso, no "todos" -- un acumulado de 12 meses donde solo
  // algunos tienen venta reconciliada da un cumplimiento artificialmente bajo
  // ("forzado"), pedido del usuario 2026-09-04 corregir el default.
  const [meses, setMeses] = useState<number[]>(() => {
    const desdeUrl = parseListParam(searchParams.get("meses")).map(Number).filter((n) => !Number.isNaN(n));
    return desdeUrl.length > 0 ? desdeUrl : [new Date().getMonth() + 1];
  });
  const [sucursalIds, setSucursalIds] = useState<string[]>(parseListParam(searchParams.get("sucursalIds")));
  const [unidadNegocioIds, setUnidadNegocioIds] = useState<string[]>(() => {
    const desdeUrl = parseListParam(searchParams.get("unidadNegocioIds"));
    if (desdeUrl.length > 0) return desdeUrl;
    return permisos.puedeElegirUnidad ? [] : (profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : []);
  });
  const [descargando, setDescargando] = useState(false);

  const filtros: ReporteFiltros = useMemo(
    () => ({ anio: anioActual, meses, sucursalIds, unidadNegocioIds }),
    [meses, sucursalIds, unidadNegocioIds],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["evaluacion-reporte", filtros],
    queryFn: () => getReporteCumplimientoAction(filtros),
    enabled: !!role,
  });

  const { data: gestion, isLoading: cargandoGestion } = useQuery({
    queryKey: ["evaluacion-gestion-asesores", filtros],
    queryFn: () => getGestionAsesoresAction(filtros),
    enabled: permisos.puedeVerGestionAsesores,
  });

  // Se genera UNA vez por montaje/combinación de filtros y se queda fija en
  // pantalla (staleTime Infinity) -- pedido del usuario 2026-09-04: la IA
  // redacta distinto cada vez, así que la pantalla guarda la primera
  // redacción "a modo de consulta" y cada exportación (que monta la página
  // de cero vía Playwright, ver /api/evaluacion/pdf) genera una nueva.
  const analisis = useQuery({
    queryKey: ["evaluacion-analisis-narrativo", filtros, data?.tipo],
    queryFn: () => {
      const reporte = data!;
      return generarAnalisisNarrativoAction({
        tipo: reporte.tipo,
        anio: reporte.anio,
        meses: reporte.meses,
        cumplimientoGeneral: reporte.cumplimientoGeneral,
        totalVenta: reporte.totalVenta,
        totalMeta: reporte.totalMeta,
        ranking: reporte.tipo === "sucursal" ? reporte.ranking : undefined,
        hallazgos: reporte.hallazgos,
      });
    },
    enabled: !!data,
    staleTime: Infinity,
    retry: 1,
  });

  function toggleMes(m: number) {
    setMeses((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }
  function toggleSucursal(id: string) {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleUnidad(id: string) {
    setUnidadNegocioIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function descargarReporte(formato: "html" | "pdf") {
    setDescargando(true);
    try {
      const params = new URLSearchParams({
        formato,
        anio: String(filtros.anio),
        meses: filtros.meses.join(","),
        sucursalIds: filtros.sucursalIds.join(","),
        unidadNegocioIds: filtros.unidadNegocioIds.join(","),
      });
      const res = await fetch(`/api/evaluacion/pdf?${params.toString()}`);
      if (!res.ok) throw new Error("No se pudo generar el reporte");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_Cumplimiento_${anioActual}.${formato}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6" id="evaluacion-print-root">
      <PageHeader
        eyebrow="Evaluación de Desempeño"
        title="Reporte de cumplimiento"
        description={`Año ${anioActual} — elige mes(es), sucursal(es) y unidad(es) según tu alcance.`}
        action={
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => descargarReporte("html")}
              disabled={descargando}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              HTML
            </button>
            <button
              onClick={() => descargarReporte("pdf")}
              disabled={descargando}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </button>
          </div>
        }
      />

      <div className="card-elevated flex flex-col gap-4 p-4 print:hidden">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mes{permisos.esAsesor ? "" : "es"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ToggleChip activo={meses.length === 0} onClick={() => setMeses([])}>
              Todos
            </ToggleChip>
            {MESES.map((nombre, i) => (
              <ToggleChip key={nombre} activo={meses.includes(i + 1)} onClick={() => toggleMes(i + 1)}>
                {nombre}
              </ToggleChip>
            ))}
          </div>
        </div>

        {permisos.puedeElegirSucursal && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sucursales</p>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip activo={sucursalIds.length === 0} onClick={() => setSucursalIds([])}>
                Todas
              </ToggleChip>
              {(sucursales ?? []).map((s) => (
                <ToggleChip key={s.id} activo={sucursalIds.includes(s.id)} onClick={() => toggleSucursal(s.id)}>
                  {s.nombre}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}

        {permisos.puedeElegirUnidad && !permisos.esAsesor && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unidades de negocio
            </p>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip activo={unidadNegocioIds.length === 0} onClick={() => setUnidadNegocioIds([])}>
                Todas
              </ToggleChip>
              {(unidades ?? []).map((u) => (
                <ToggleChip key={u.id} activo={unidadNegocioIds.includes(u.id)} onClick={() => toggleUnidad(u.id)}>
                  {u.nombre}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
        {permisos.esAsesor && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unidad de negocio
            </p>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip activo={unidadNegocioIds.length === 0} onClick={() => setUnidadNegocioIds([])}>
                Todas las mías
              </ToggleChip>
              {(unidades ?? []).map((u) => (
                <ToggleChip key={u.id} activo={unidadNegocioIds.includes(u.id)} onClick={() => toggleUnidad(u.id)}>
                  {u.nombre}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <PageSkeleton kpis={4} blocks={[{ cols: 2, height: 260 }]} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.4fr]">
            <ComplianceGauge
              pct={data.cumplimientoGeneral}
              facturado={data.totalVenta}
              presupuesto={data.totalMeta}
              title="Cumplimiento del período seleccionado"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KpiCard label="Total Facturado" value={money(data.totalVenta)} accent="primary" />
              <KpiCard label="Meta del período" value={money(data.totalMeta)} accent="ochre" />
              <KpiCard
                label="Cumplimiento"
                value={pct(data.cumplimientoGeneral, 1)}
                accent={statusFromPct90(data.cumplimientoGeneral)}
              />
              <KpiCard
                label="Meses incluidos"
                value={String(data.meses.length || 12)}
                hint={data.meses.length === 0 ? "Todos los disponibles" : data.meses.map((m) => MESES[m - 1]).join(", ")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.hallazgos.map((h, i) => (
              <HallazgoCard key={i} tipo={h.tipo} titulo={h.titulo} texto={h.texto} />
            ))}
          </div>

          <div className="card-elevated p-5">
            <h3 className="mb-3 font-display text-sm font-semibold">Análisis narrativo</h3>
            {analisis.isLoading ? (
              <p className="text-sm text-muted-foreground">Generando análisis con IA…</p>
            ) : analisis.isError ? (
              <p className="text-sm text-danger">
                No se pudo generar el análisis narrativo ({(analisis.error as Error)?.message ?? "error desconocido"}).
              </p>
            ) : (
              <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
                {(analisis.data ?? "").split(/\n{2,}/).map((parrafo, i) => (
                  <p key={i}>{parrafo}</p>
                ))}
              </div>
            )}
          </div>

          {data.tipo === "sucursal" && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BranchRanking rows={data.ranking} />
                <UnitDonut
                  title="Composición por compañía"
                  data={[
                    { label: "Consorcio (CCV)", facturado: data.composicionCompania.ccv },
                    { label: "Xibi B.V.", facturado: data.composicionCompania.xibi },
                    { label: "Otra Empresa", facturado: data.composicionCompania.estrategicas },
                  ]}
                />
              </div>

              <div className="card-elevated overflow-hidden">
                <div className="border-b border-border p-4">
                  <h3 className="font-display text-sm font-semibold">Cumplimiento por sucursal y mes</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-accent">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-accent-foreground">
                          Sucursal
                        </th>
                        {data.heatmap[0]?.celdas.map((c) => (
                          <th
                            key={c.mes}
                            className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-accent-foreground"
                          >
                            {MESES[c.mes - 1]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.heatmap.map((fila) => (
                        <tr key={fila.sucursal} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{fila.sucursal}</td>
                          {fila.celdas.map((c) => {
                            const status = c.pct === null ? null : statusFromPct90(c.pct);
                            return (
                              <td
                                key={c.mes}
                                className={cn(
                                  "px-3 py-2 text-center tabular-nums",
                                  status === "success" && "bg-success/10 text-success",
                                  status === "warning" && "bg-warning/10 text-warning",
                                  status === "danger" && "bg-danger/10 text-danger",
                                )}
                              >
                                {c.pct === null ? "—" : pct(c.pct, 0)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.detalleMarca &&
                (data.detalleMarca.repuestos.length > 0 ||
                  data.detalleMarca.lubfiltros.length > 0 ||
                  data.detalleMarca.equipos.length > 0) && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {data.detalleMarca.repuestos.length > 0 && (
                      <MarcaBarCard titulo="Repuestos por marca" filas={data.detalleMarca.repuestos} />
                    )}
                    {data.detalleMarca.lubfiltros.length > 0 && (
                      <MarcaBarCard titulo="Lub/Filtros por marca" filas={data.detalleMarca.lubfiltros} />
                    )}
                    {data.detalleMarca.equipos.length > 0 && (
                      <MarcaBarCard titulo="Equipos por marca" filas={data.detalleMarca.equipos} />
                    )}
                  </div>
                )}
            </>
          )}

          {data.tipo === "asesor" && (
            <div className="card-elevated p-4">
              <h3 className="mb-4 font-display text-sm font-semibold">Tu cumplimiento por mes</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.puntos.map((p) => (
                  <KpiCard
                    key={p.mes}
                    label={MESES[p.mes - 1]}
                    value={p.presupuesto > 0 ? pct((p.venta / p.presupuesto) * 100, 0) : "—"}
                    hint={`${money(p.venta)} de ${money(p.presupuesto)}`}
                  />
                ))}
              </div>
            </div>
          )}

          {permisos.puedeVerGestionAsesores && (
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border p-4">
                <h3 className="font-display text-sm font-semibold">Gestión del asesor: cotizado → facturado → perdido</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Score ponderado = 40% cumplimiento + 35% tasa de conversión (facturado/cotizado) + 25% (1 − tasa de
                  pérdida). Refleja capacidad de negociación, no solo volumen.
                </p>
              </div>
              {cargandoGestion || !gestion ? (
                <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
              ) : gestion.filas.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Sin cotizaciones en el período seleccionado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-accent">
                      <tr>
                        {["Asesor", "Cotizado", "Clientes cot.", "Facturado", "Cumplimiento", "Perdido", "Clientes perd.", "Conversión", "Score"].map(
                          (h) => (
                            <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-accent-foreground">
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {gestion.filas.map((f) => (
                        <tr key={f.codigoAsesor} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{f.asesor}</td>
                          <td className="px-3 py-2 tabular-nums">{money(f.cotizado)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{f.clientesCotizados}</td>
                          <td className="px-3 py-2 tabular-nums">{money(f.facturado)}</td>
                          <td
                            className={cn(
                              "px-3 py-2 tabular-nums",
                              f.presupuesto > 0 &&
                                (statusFromPct90(f.cumplimiento) === "success"
                                  ? "text-success"
                                  : statusFromPct90(f.cumplimiento) === "warning"
                                    ? "text-warning"
                                    : "text-danger"),
                            )}
                          >
                            {f.presupuesto > 0 ? pct(f.cumplimiento, 0) : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-danger">{money(f.perdido)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{f.clientesPerdidos}</td>
                          <td className="px-3 py-2 tabular-nums">{pct(f.tasaConversion, 0)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.scorePonderado.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
