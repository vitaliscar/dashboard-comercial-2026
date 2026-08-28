"use server";

import { and, eq, sql, ne } from "drizzle-orm";
import { cumplimientoAsesores, facturas, profiles } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { calcularScoreCompuesto, percentilEnGrupo, type MonthlyPoint } from "@/lib/performance-score";

/**
 * Evaluación de desempeño del asesor autenticado (siempre sobre sí mismo — un
 * asesor solo puede ver/descargar su propio reporte, nunca el de un par).
 */
export async function getEvaluacionAsesorAction(anio: number) {
  return withAuth(async ({ tx, userId, role, profile }) => {
    if (role !== "asesor") {
      throw new Error("Esta evaluación es solo para el rol asesor");
    }

    const propio = await tx
      .select({
        mes: cumplimientoAsesores.mes,
        venta: sql<number>`SUM(${cumplimientoAsesores.venta})::float`,
        presupuesto: sql<number>`SUM(${cumplimientoAsesores.presupuesto})::float`,
      })
      .from(cumplimientoAsesores)
      .where(and(eq(cumplimientoAsesores.anio, anio), eq(cumplimientoAsesores.asesorId, userId)))
      .groupBy(cumplimientoAsesores.mes)
      .orderBy(cumplimientoAsesores.mes);

    const puntos: MonthlyPoint[] = propio.map((r) => ({
      mes: r.mes,
      venta: Number(r.venta ?? 0),
      presupuesto: Number(r.presupuesto ?? 0),
    }));

    const [ticketPropioRes] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${facturas.monto}), 0)::float`,
        cantidad: sql<number>`COUNT(*)::int`,
      })
      .from(facturas)
      .where(
        and(
          eq(facturas.asesorId, userId),
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
        ),
      );
    const ticketPropio =
      ticketPropioRes && ticketPropioRes.cantidad > 0
        ? ticketPropioRes.total / ticketPropioRes.cantidad
        : 0;

    // Pares: mismos asesores de la misma sucursal (excluyéndose a sí mismo).
    const sucursalId = profile.sucursalId;
    const pares = sucursalId
      ? await tx
          .select({
            asesorId: cumplimientoAsesores.asesorId,
            venta: sql<number>`SUM(${cumplimientoAsesores.venta})::float`,
            presupuesto: sql<number>`SUM(${cumplimientoAsesores.presupuesto})::float`,
          })
          .from(cumplimientoAsesores)
          .where(
            and(
              eq(cumplimientoAsesores.anio, anio),
              eq(cumplimientoAsesores.sucursalId, sucursalId),
              ne(cumplimientoAsesores.asesorId, userId),
            ),
          )
          .groupBy(cumplimientoAsesores.asesorId)
      : [];

    const paresConDatos = pares.filter((p) => p.asesorId && Number(p.presupuesto) > 0);
    const cumplimientosPares = paresConDatos.map(
      (p) => (Number(p.venta) / Number(p.presupuesto)) * 100,
    );

    let ticketPromedioGrupo = 0;
    if (sucursalId) {
      const [gRes] = await tx
        .select({
          total: sql<number>`COALESCE(SUM(${facturas.monto}), 0)::float`,
          cantidad: sql<number>`COUNT(*)::int`,
        })
        .from(facturas)
        .where(
          and(
            eq(facturas.sucursalId, sucursalId),
            sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
          ),
        );
      ticketPromedioGrupo = gRes && gRes.cantidad > 0 ? gRes.total / gRes.cantidad : 0;
    }

    const scoreResult = calcularScoreCompuesto({ puntos, ticketPropio, ticketPromedioGrupo });
    const cumplimientoPropioTotal = scoreResult.cumplimiento;
    const percentil = percentilEnGrupo(cumplimientoPropioTotal, cumplimientosPares);

    const [asesorProfile] = await tx
      .select({ nombreCompleto: profiles.nombreCompleto })
      .from(profiles)
      .where(eq(profiles.id, userId));

    return {
      asesor: asesorProfile?.nombreCompleto ?? "Asesor",
      anio,
      puntos,
      ticketPropio,
      ticketPromedioGrupo,
      cantidadPares: paresConDatos.length,
      percentilVsPares: percentil,
      score: scoreResult,
    };
  });
}
