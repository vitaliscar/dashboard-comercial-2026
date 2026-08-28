"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnidades } from "@/hooks/use-catalogos";
import { getEvaluacionUnidadAction } from "@/lib/actions/evaluacion";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { money, pct, MESES } from "@/lib/format";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const anioActual = new Date().getFullYear();

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">
              Evolución de cumplimiento — {anioActual}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={data.puntos.map((p) => ({
                  mes: MESES[p.mes - 1] ?? `M${p.mes}`,
                  cumplimiento:
                    p.presupuesto > 0 ? Math.round((p.venta / p.presupuesto) * 1000) / 10 : 0,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line
                  type="monotone"
                  dataKey="cumplimiento"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
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
