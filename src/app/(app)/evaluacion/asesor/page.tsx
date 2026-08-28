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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const anioActual = new Date().getFullYear();

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

  const chartData = data.puntos.map((p) => ({
    mes: MESES[p.mes - 1] ?? `M${p.mes}`,
    cumplimiento: p.presupuesto > 0 ? Math.round((p.venta / p.presupuesto) * 1000) / 10 : 0,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Score de Desempeño"
          value={String(data.score.score)}
          hint="Cumplimiento 50% + Tendencia 30% + Ticket 20%"
          accent={data.score.banda}
        />
        <KpiCard
          label="Cumplimiento"
          value={pct(data.score.cumplimiento, 1)}
          accent={data.score.cumplimiento >= 90 ? "success" : "warning"}
        />
        <KpiCard
          label="Tendencia (ene→último mes)"
          value={pct(data.score.tendencia, 0)}
          hint="50 = estable, >50 mejora, <50 empeora"
        />
        <KpiCard
          label="Vs. pares de sucursal"
          value={`Percentil ${data.percentilVsPares}`}
          hint={`${data.cantidadPares} asesores comparados`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Evolución de cumplimiento — {anioActual}
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <XAxis dataKey="mes" />
            <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Line type="monotone" dataKey="cumplimiento" stroke="var(--color-primary)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Ticket Promedio Propio" value={money(data.ticketPropio)} />
        <KpiCard label="Ticket Promedio del Grupo" value={money(data.ticketPromedioGrupo)} />
      </div>
    </div>
  );
}
