"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getEvaluacionAsesorAction } from "@/lib/actions/evaluacion";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { money, pct, MESES } from "@/lib/format";
import { createChartLabel } from "@/lib/chart-labels";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const anioActual = new Date().getFullYear();

type EvaluacionAsesor = Awaited<ReturnType<typeof getEvaluacionAsesorAction>>;

function narrativaAsesor(data: EvaluacionAsesor): string {
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

  const comparacionTexto =
    data.cantidadPares > 0
      ? `Estás en el percentil ${data.percentilVsPares} entre ${data.cantidadPares} asesores de tu sucursal — ${
          data.percentilVsPares >= 75
            ? "por encima de la mayoría de tus compañeros"
            : data.percentilVsPares >= 40
              ? "en un rango medio frente a tus compañeros"
              : "por debajo de la mayoría de tus compañeros"
        }.`
      : "Aún no hay suficientes compañeros de sucursal con datos para comparar.";

  const ticketTexto =
    data.ticketPromedioGrupo > 0
      ? data.ticketPropio >= data.ticketPromedioGrupo
        ? `Tu ticket promedio (${money(data.ticketPropio)}) supera el de tu grupo (${money(
            data.ticketPromedioGrupo,
          )}), señal de ventas de mayor valor por cliente.`
        : `Tu ticket promedio (${money(data.ticketPropio)}) está por debajo del de tu grupo (${money(
            data.ticketPromedioGrupo,
          )}).`
      : "";

  return `En ${mesUltimo} cerraste con ${pct(cumplUltimo, 1)} de cumplimiento, lo que refleja ${nivelTexto}, con una tendencia ${tendenciaTexto}. ${comparacionTexto} ${ticketTexto}`;
}

export default function EvaluacionAsesorPage() {
  const { role } = useAuth();
  const canView = role === "asesor";
  const [descargando, setDescargando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["evaluacion-asesor", anioActual],
    queryFn: () => getEvaluacionAsesorAction(anioActual),
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Esta evaluación es solo para el rol asesor.
      </div>
    );
  }

  if (isLoading || !data) return <PageSkeleton kpis={4} />;
  const evaluacion = data;

  const chartData = [...data.puntos]
    .sort((a, b) => a.mes - b.mes)
    .map((p) => ({
      mes: MESES[p.mes - 1] ?? `M${p.mes}`,
      cumplimiento: p.presupuesto > 0 ? Math.round((p.venta / p.presupuesto) * 1000) / 10 : null,
    }));

  async function descargarPdf() {
    setDescargando(true);
    try {
      const res = await fetch("/api/evaluacion/pdf?tipo=asesor", { method: "GET" });
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Evaluacion_Desempeno_${evaluacion.asesor.replace(/\s+/g, "_")}_${anioActual}.pdf`;
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
        title={data.asesor}
        description={`Año ${anioActual}`}
        action={
          <button
            onClick={descargarPdf}
            disabled={descargando}
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

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Análisis</h3>
        <p className="text-sm leading-relaxed text-foreground">{narrativaAsesor(evaluacion)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Score de Desempeño"
          value={String(data.score.score)}
          hint="Combina Cumplimiento (50%), Tendencia (30%) y Ticket vs. grupo (20%). 90+ es sobresaliente, menos de 50 necesita atención."
          accent={data.score.banda}
        />
        <KpiCard
          label="Cumplimiento"
          value={pct(data.score.cumplimiento, 1)}
          hint="Venta total del año dividida entre presupuesto total del año."
          accent={data.score.cumplimiento >= 90 ? "success" : "warning"}
        />
        <KpiCard
          label="Tendencia"
          value={pct(data.score.tendencia, 0)}
          hint="Compara tu cumplimiento de enero contra el del último mes con datos. 50 = estable, más de 50 = mejorando, menos de 50 = empeorando."
        />
        <KpiCard
          label="Vs. pares de sucursal"
          value={`Percentil ${data.percentilVsPares}`}
          hint={`Comparado con ${data.cantidadPares} asesores de tu misma sucursal. Percentil 100 = el mejor del grupo.`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Evolución de cumplimiento por mes — {anioActual}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Ticket Promedio Propio"
          value={money(data.ticketPropio)}
          hint="Monto facturado dividido entre número de facturas, todo el año."
        />
        <KpiCard
          label="Ticket Promedio del Grupo"
          value={money(data.ticketPromedioGrupo)}
          hint="Mismo cálculo, pero para todos los asesores de tu sucursal."
        />
      </div>
    </div>
  );
}
