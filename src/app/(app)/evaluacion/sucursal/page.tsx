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
import { createChartLabel } from "@/lib/chart-labels";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const anioActual = new Date().getFullYear();

type EvaluacionSucursal = Awaited<ReturnType<typeof getEvaluacionSucursalAction>>;

function narrativaSucursal(data: EvaluacionSucursal): string {
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
      ? `Está en el percentil ${data.percentilVsPares} entre ${data.cantidadPares} sucursales — ${
          data.percentilVsPares >= 75
            ? "por encima de la mayoría."
            : data.percentilVsPares >= 40
              ? "en un rango medio."
              : "por debajo de la mayoría."
        }`
      : "";

  return `En ${mesUltimo} cerró con ${pct(cumplUltimo, 1)} de cumplimiento, lo que refleja ${nivelTexto}, con una tendencia ${tendenciaTexto}. ${comparacionTexto}`;
}

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
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Análisis</h3>
            <p className="text-sm leading-relaxed text-foreground">{narrativaSucursal(data)}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Score de Desempeño"
              value={String(data.score.score)}
              hint="Combina Cumplimiento (50%), Tendencia (30%) y Ticket vs. otras sucursales (20%). 90+ es sobresaliente, menos de 50 necesita atención."
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
              hint="Compara el cumplimiento de enero contra el del último mes con datos. 50 = estable, más de 50 = mejorando."
            />
            <KpiCard
              label="Vs. todas las sucursales"
              value={`Percentil ${data.percentilVsPares}`}
              hint={`Comparado con ${data.cantidadPares} sucursales. Percentil 100 = la mejor.`}
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard
              label="Ticket Promedio Propio"
              value={money(data.ticketPropio)}
              hint="Monto facturado dividido entre número de facturas, todo el año."
            />
            <KpiCard
              label="Ticket Promedio del Grupo"
              value={money(data.ticketPromedioGrupo)}
              hint="Mismo cálculo, pero para el resto de las sucursales."
            />
          </div>
        </>
      )}
    </div>
  );
}
