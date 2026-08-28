"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales } from "@/hooks/use-catalogos";
import { getEvaluacionSucursalAction } from "@/lib/actions/evaluacion";
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
  CartesianGrid,
} from "recharts";

const anioActual = new Date().getFullYear();

export default function EvaluacionSucursalPage() {
  const { role, profile } = useAuth();
  const canView = role === "coordinador" || role === "gerente_comercial" || role === "gerencia";
  const necesitaSeleccion = role === "gerente_comercial" || role === "gerencia";

  const { data: sucursales } = useSucursales();
  const searchParams = useSearchParams();
  const [sucursalId, setSucursalId] = useState<string>(searchParams.get("sucursalId") ?? "");
  const [descargando, setDescargando] = useState(false);

  const sucursalEfectiva = necesitaSeleccion ? sucursalId : (profile?.sucursal_id ?? undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["evaluacion-sucursal", anioActual, sucursalEfectiva],
    queryFn: () => getEvaluacionSucursalAction(anioActual, sucursalEfectiva),
    enabled: canView && !!sucursalEfectiva,
  });

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Esta evaluación no está disponible para el rol asesor.
      </div>
    );
  }

  async function descargarPdf() {
    if (!sucursalEfectiva) return;
    setDescargando(true);
    try {
      const res = await fetch(
        `/api/evaluacion/pdf?tipo=sucursal&sucursalId=${sucursalEfectiva}`,
        { method: "GET" },
      );
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Evaluacion_Desempeno_Sucursal_${anioActual}.pdf`;
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
        title={data?.sucursal ?? "Sucursal"}
        description={`Año ${anioActual}`}
        action={
          <button
            onClick={descargarPdf}
            disabled={descargando || !sucursalEfectiva}
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

      {necesitaSeleccion && (
        <div className="print:hidden">
          <label className="mb-1 block text-sm text-muted-foreground">Sucursal</label>
          <select
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
          >
            <option value="">Seleccionar sucursal…</option>
            {(sucursales ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      {!sucursalEfectiva ? (
        <div className="p-8 text-center text-muted-foreground">
          Selecciona una sucursal para ver su evaluación.
        </div>
      ) : isLoading || !data ? (
        <PageSkeleton kpis={4} />
      ) : (
        <>
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
              label="Vs. todas las sucursales"
              value={`Percentil ${data.percentilVsPares}`}
              hint={`${data.cantidadPares} sucursales comparadas`}
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard label="Ticket Promedio Propio" value={money(data.ticketPropio)} />
            <KpiCard label="Ticket Promedio del Grupo" value={money(data.ticketPromedioGrupo)} />
          </div>
        </>
      )}
    </div>
  );
}
