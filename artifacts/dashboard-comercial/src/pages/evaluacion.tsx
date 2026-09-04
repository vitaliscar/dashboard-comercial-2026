import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getGestionAsesores,
  getReporteEvaluacion,
  type GestionAsesorFila,
  type Hallazgo,
  type MarcaMonto,
  type ReporteFiltros,
} from "@/lib/evaluacion-http";
import { money, pct } from "@/lib/format";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Página unificada de Evaluación de Desempeño -- port de ccv-main (Next.js)
 * src/app/(app)/evaluacion/page.tsx a este stack (Vite + wouter + React
 * Query). Mismo gating por rol que el original: gerencia/admin libre;
 * gerente_comercial fija unidad propia; coordinador fija sucursal propia;
 * asesor siempre ve solo su propio dato (mes/unidad libres).
 */
export default function EvaluacionPage() {
  const { role, profile } = useAuth();
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();
  const anio = new Date().getFullYear();

  const [meses, setMeses] = useState<number[]>([new Date().getMonth() + 1]);
  const [sucursalIds, setSucursalIds] = useState<string[]>(
    role === "coordinador" && profile?.sucursal_id ? [profile.sucursal_id] : [],
  );
  const [unidadNegocioIds, setUnidadNegocioIds] = useState<string[]>(
    role === "gerente_comercial" && profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : [],
  );

  const sucursalFija = role === "coordinador";
  const unidadFija = role === "gerente_comercial";
  const esAsesor = role === "asesor";
  const puedeVerGestionAsesores = role === "gerencia" || role === "gerente_comercial" || role === "coordinador";

  const filtros: ReporteFiltros = { anio, meses, sucursalIds: esAsesor ? [] : sucursalIds, unidadNegocioIds };

  const reporte = useQuery({
    queryKey: ["evaluacion-reporte", filtros],
    queryFn: () => getReporteEvaluacion(filtros),
  });
  const gestion = useQuery({
    queryKey: ["evaluacion-gestion-asesores", filtros],
    queryFn: () => getGestionAsesores(filtros),
    enabled: puedeVerGestionAsesores,
  });

  const toggle = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const toggleId = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Evaluación de Desempeño" title="Cumplimiento y gestión comercial" description={`Año ${anio}`} />

      <section className="flex flex-wrap items-start gap-6 rounded-lg border bg-card p-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mes(es)</p>
          <div className="flex flex-wrap gap-1.5">
            {MESES.map((label, i) => {
              const m = i + 1;
              const active = meses.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMeses((prev) => toggle(prev, m))}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {!esAsesor && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Sucursal(es)</p>
            {sucursalFija ? (
              <p className="text-sm text-muted-foreground">Fijada a tu sucursal asignada.</p>
            ) : (
              <div className="flex max-w-md flex-wrap gap-1.5">
                {sucursales?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSucursalIds((prev) => toggleId(prev, s.id))}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${sucursalIds.includes(s.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Unidad(es) de negocio</p>
          {unidadFija ? (
            <p className="text-sm text-muted-foreground">Fijada a tu unidad asignada.</p>
          ) : (
            <div className="flex max-w-md flex-wrap gap-1.5">
              {unidades?.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUnidadNegocioIds((prev) => toggleId(prev, u.id))}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${unidadNegocioIds.includes(u.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {u.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {reporte.isLoading ? (
        <p className="p-8 text-center text-muted-foreground">Cargando reporte…</p>
      ) : reporte.isError || !reporte.data ? (
        <p className="p-8 text-center text-destructive">{reporte.error?.message ?? "No se pudo cargar el reporte."}</p>
      ) : reporte.data.tipo === "asesor" ? (
        <ReporteAsesor data={reporte.data} />
      ) : (
        <ReporteSucursal data={reporte.data} />
      )}

      {puedeVerGestionAsesores && (
        <GestionAsesoresSection query={gestion} />
      )}
    </div>
  );
}

function HallazgoCard({ h }: { h: Hallazgo }) {
  const tone = h.tipo === "good" ? "border-emerald-500/30 bg-emerald-500/5" : h.tipo === "bad" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5";
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <p className="text-sm font-semibold">{h.titulo}</p>
      <p className="mt-1 text-sm text-muted-foreground">{h.texto}</p>
    </div>
  );
}

function MarcaBarCard({ titulo, filas }: { titulo: string; filas: MarcaMonto[] }) {
  const top = filas.length > 5 ? [...filas.slice(0, 4), { marca: "Otra marca", monto: filas.slice(4).reduce((s, f) => s + f.monto, 0) }] : filas;
  const max = Math.max(...top.map((f) => f.monto), 1);
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold">{titulo}</h3>
      <div className="flex flex-col gap-2.5">
        {top.map((f) => (
          <div key={f.marca} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs font-medium" title={f.marca}>{f.marca}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(f.monto / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{money(f.monto)}</span>
          </div>
        ))}
        {top.length === 0 && <p className="text-xs text-muted-foreground">Sin datos para este filtro.</p>}
      </div>
    </div>
  );
}

function ReporteAsesor({ data }: { data: import("@/lib/evaluacion-http").ReporteAsesorPropio }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Cumplimiento" value={pct(data.cumplimientoGeneral, 1)} />
        <KpiCard label="Facturado" value={money(data.totalVenta)} />
        <KpiCard label="Meta" value={money(data.totalMeta)} />
      </div>
      <div className="flex flex-col gap-3">
        {data.hallazgos.map((h) => (
          <HallazgoCard key={h.titulo} h={h} />
        ))}
      </div>
    </>
  );
}

function ReporteSucursal({ data }: { data: import("@/lib/evaluacion-http").ReporteSucursal }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Cumplimiento general" value={pct(data.cumplimientoGeneral, 1)} />
        <KpiCard label="Facturado" value={money(data.totalVenta)} />
        <KpiCard label="Meta" value={money(data.totalMeta)} />
      </div>

      <div className="flex flex-col gap-3">
        {data.hallazgos.map((h) => (
          <HallazgoCard key={h.titulo} h={h} />
        ))}
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Ranking por sucursal</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Sucursal</th>
                <th className="py-2 text-right">Meta</th>
                <th className="py-2 text-right">Facturado</th>
                <th className="py-2 text-right">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{money(r.meta)}</td>
                  <td className="py-2 text-right tabular-nums">{money(r.facturado)}</td>
                  <td className={`py-2 text-right tabular-nums font-medium ${r.pct >= 90 ? "text-emerald-600" : r.pct >= 70 ? "text-amber-600" : "text-destructive"}`}>
                    {pct(r.pct, 1)}
                  </td>
                </tr>
              ))}
              {data.ranking.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">Sin datos para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.detalleMarca && (
        <div className="grid gap-4 md:grid-cols-3">
          <MarcaBarCard titulo="Repuestos por marca" filas={data.detalleMarca.repuestos} />
          <MarcaBarCard titulo="Lub/Filtros por marca" filas={data.detalleMarca.lubfiltros} />
          <MarcaBarCard titulo="Equipos por marca" filas={data.detalleMarca.equipos} />
        </div>
      )}
    </>
  );
}

function GestionAsesoresSection({ query }: { query: ReturnType<typeof useQuery<import("@/lib/evaluacion-http").GestionAsesores>> }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">Gestión del asesor: cotizado → facturado → perdido</h3>
      <p className="mb-3 text-xs text-muted-foreground">Solo visible para gerencia, gerente comercial y coordinador.</p>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : query.isError || !query.data ? (
        <p className="text-sm text-destructive">{query.error?.message ?? "No se pudo cargar."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Asesor</th>
                <th className="py-2 text-right">Cotizado</th>
                <th className="py-2 text-right">Facturado</th>
                <th className="py-2 text-right">Perdido</th>
                <th className="py-2 text-right">Conversión</th>
                <th className="py-2 text-right">Cumplimiento</th>
                <th className="py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {query.data.filas.map((f: GestionAsesorFila) => (
                <tr key={f.codigoAsesor} className="border-b last:border-0">
                  <td className="py-2">{f.asesor}</td>
                  <td className="py-2 text-right tabular-nums">{money(f.cotizado)}</td>
                  <td className="py-2 text-right tabular-nums">{money(f.facturado)}</td>
                  <td className="py-2 text-right tabular-nums">{money(f.perdido)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(f.tasaConversion, 1)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(f.cumplimiento, 1)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{Math.round(f.scorePonderado)}</td>
                </tr>
              ))}
              {query.data.filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">Sin asesores para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
