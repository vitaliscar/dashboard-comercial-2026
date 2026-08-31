"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "@/hooks/use-next-compat";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-catalogos";
import { getEvaluacionUnidadAction } from "@/lib/actions/evaluacion";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { money, pct, MESES } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { createChartLabel } from "@/lib/chart-labels";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const anioActual = new Date().getFullYear();

type EvaluacionUnidad = Awaited<ReturnType<typeof getEvaluacionUnidadAction>>;

function narrativaUnidad(data: EvaluacionUnidad): string {
  const puntosConDatos = data.puntos
    .filter((p) => p.presupuesto > 0)
    .sort((a, b) => a.mes - b.mes);
  if (puntosConDatos.length === 0) {
    return "Todavía no hay datos de presupuesto cargados para este año.";
  }
  const ultimo = puntosConDatos[puntosConDatos.length - 1];
  const cumplUltimo = (ultimo.venta / ultimo.presupuesto) * 100;
  const mesUltimo = MESES[ultimo.mes - 1];

  const nivelTexto =
    data.score.score >= 90
      ? "un desempeño sobresaliente"
      : data.score.score >= 50
        ? "un desempeño dentro de rango, con espacio para mejorar"
        : "un desempeño por debajo de lo esperado";

  const tendenciaTexto =
    data.score.tendencia > 55
      ? "mejorando mes a mes"
      : data.score.tendencia < 45
        ? "en descenso respecto a meses anteriores"
        : "estable, sin cambios marcados";

  const sucursales = [...data.desglosePorSucursal].sort((a, b) => b.cumplimiento - a.cumplimiento);
  const desgloseTexto =
    sucursales.length > 0
      ? `La sucursal con mejor cumplimiento es ${sucursales[0].sucursal} (${pct(
          sucursales[0].cumplimiento,
          1,
        )}); la más rezagada es ${sucursales[sucursales.length - 1].sucursal} (${pct(
          sucursales[sucursales.length - 1].cumplimiento,
          1,
        )}).`
      : "";

  return `En ${mesUltimo} cerró con ${pct(cumplUltimo, 1)} de cumplimiento, lo que refleja ${nivelTexto}, con una tendencia ${tendenciaTexto}. ${desgloseTexto}`;
}

export default function EvaluacionUnidadPage() {
  const { role } = useAuth();
  const canView = role === "coordinador" || role === "gerente_comercial" || role === "gerencia";

  const { data: unidades } = useUnidades();
  const searchParams = useSearchParams();
  const [unidadId, setUnidadId] = useState<string>(searchParams.get("unidadId") ?? "");
  const [descargando, setDescargando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["evaluacion-unidad", anioActual, unidadId],
    queryFn: () => getEvaluacionUnidadAction(anioActual, unidadId),
    enabled: canView && !!unidadId,
  });

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Esta evaluación no está disponible para el rol asesor.
      </div>
    );
  }

  async function descargarPdf() {
    if (!unidadId) return;
    setDescargando(true);
    try {
      const res = await fetch(`/api/evaluacion/pdf?tipo=unidad&unidadId=${unidadId}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Evaluacion_Desempeno_Unidad_${anioActual}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="space-y-6 p-6" id="evaluacion-print-root">
      <PageHeader
        eyebrow="Evaluación de Desempeño"
        title={data?.unidad ?? "Unidad de Negocio"}
        description={`Año ${anioActual}`}
        action={
          <button
            onClick={descargarPdf}
            disabled={descargando || !unidadId}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60 print:hidden"
          >
            {descargando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Descargar PDF
          </button>
        }
      />

      <div className="print:hidden">
        <label className="mb-1 block text-sm text-muted-foreground">Unidad de Negocio</label>
        <select
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          value={unidadId}
          onChange={(e) => setUnidadId(e.target.value)}
        >
          <option value="">Seleccionar unidad…</option>
          {(unidades ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {unidadLabelInfo(u.nombre).label}
            </option>
          ))}
        </select>
      </div>

      {!unidadId ? (
        <div className="p-8 text-center text-muted-foreground">
          Selecciona una unidad de negocio para ver su evaluación.
        </div>
      ) : isLoading || !data ? (
        <PageSkeleton kpis={4} />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Análisis</h3>
            <p className="text-sm leading-relaxed text-foreground">{narrativaUnidad(data)}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Score de Desempeño"
              value={String(data.score.score)}
              hint="Combina Cumplimiento (50%) y Tendencia (30%). Sin comparación entre unidades — no aplica ticket relativo aquí."
              accent={data.score.banda}
            />
            <KpiCard
              label="Cumplimiento"
              value={pct(data.score.cumplimiento, 1)}
              hint="Venta total del año dividida entre presupuesto total del año, para esta unidad."
              accent={data.score.cumplimiento >= 90 ? "success" : "warning"}
            />
            <KpiCard
              label="Tendencia"
              value={pct(data.score.tendencia, 0)}
              hint="Compara el cumplimiento de enero contra el del último mes con datos. 50 = estable, más de 50 = mejorando."
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Evolución de cumplimiento por mes — {anioActual}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={[...data.puntos]
                  .sort((a, b) => a.mes - b.mes)
                  .map((p) => ({
                    mes: MESES[p.mes - 1] ?? `M${p.mes}`,
                    cumplimiento:
                      p.presupuesto > 0 ? Math.round((p.venta / p.presupuesto) * 1000) / 10 : null,
                  }))}
                margin={{ top: 24, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                <Tooltip formatter={(v) => (v == null ? "Sin datos" : `${v}%`)} />
                <Line
                  type="monotone"
                  dataKey="cumplimiento"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                  label={createChartLabel({
                    formatter: (v) => `${v}%`,
                    fill: "var(--color-primary)",
                    dy: -12,
                    fontSize: 11,
                  })}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Desglose por sucursal
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">Sucursal</th>
                  <th className="py-2 text-right">Presupuesto</th>
                  <th className="py-2 text-right">Venta</th>
                  <th className="py-2 text-right">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {data.desglosePorSucursal.map((s) => (
                  <tr key={s.sucursal} className="border-b border-border/50">
                    <td className="py-2">{s.sucursal}</td>
                    <td className="py-2 text-right">{money(s.presupuesto)}</td>
                    <td className="py-2 text-right">{money(s.venta)}</td>
                    <td className="py-2 text-right">{pct(s.cumplimiento, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
