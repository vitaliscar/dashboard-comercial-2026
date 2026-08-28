"use server";

import { and, eq, sql, ne, inArray } from "drizzle-orm";
import {
  cumplimientoAsesores,
  facturas,
  profiles,
  presupuestos,
  sucursales,
  unidadesNegocio,
} from "@/db/schema";
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

/**
 * Evaluación de desempeño de una sucursal.
 * - coordinador: siempre su propia sucursal (se ignora sucursalIdParam).
 * - gerente_comercial / gerencia: requiere sucursalIdParam; el RLS de Postgres
 *   ya restringe el resultado a lo que ese rol puede ver (unidad asignada para
 *   gerente_comercial, todo para gerencia).
 */
export async function getEvaluacionSucursalAction(anio: number, sucursalIdParam?: string) {
  return withAuth(async ({ tx, role, profile }) => {
    if (role === "asesor") {
      throw new Error("Esta evaluación no está disponible para el rol asesor");
    }

    const sucursalId = role === "coordinador" ? profile.sucursalId : sucursalIdParam;
    if (!sucursalId) {
      throw new Error("Debe especificar una sucursal");
    }

    const propio = await tx
      .select({
        mes: presupuestos.mes,
        presupuesto: sql<number>`SUM(${presupuestos.monto})::float`,
      })
      .from(presupuestos)
      .where(and(eq(presupuestos.anio, anio), eq(presupuestos.sucursalId, sucursalId)))
      .groupBy(presupuestos.mes);

    const ventasPorMes = await tx
      .select({
        mes: sql<number>`EXTRACT(MONTH FROM ${facturas.fecha})::int`,
        venta: sql<number>`SUM(${facturas.monto})::float`,
      })
      .from(facturas)
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
          eq(facturas.sucursalId, sucursalId),
        ),
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${facturas.fecha})`);

    const ventaPorMesMap = new Map(ventasPorMes.map((v) => [v.mes, Number(v.venta ?? 0)]));
    const puntos: MonthlyPoint[] = propio.map((r) => ({
      mes: r.mes,
      venta: ventaPorMesMap.get(r.mes) ?? 0,
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
          eq(facturas.sucursalId, sucursalId),
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
        ),
      );
    const ticketPropio =
      ticketPropioRes && ticketPropioRes.cantidad > 0
        ? ticketPropioRes.total / ticketPropioRes.cantidad
        : 0;

    // Pares: todas las demás sucursales visibles según el RLS del rol actual.
    const paresPresupuesto = await tx
      .select({
        sucursalId: presupuestos.sucursalId,
        presupuesto: sql<number>`SUM(${presupuestos.monto})::float`,
      })
      .from(presupuestos)
      .where(and(eq(presupuestos.anio, anio), ne(presupuestos.sucursalId, sucursalId)))
      .groupBy(presupuestos.sucursalId);

    const paresVenta = await tx
      .select({
        sucursalId: facturas.sucursalId,
        venta: sql<number>`SUM(${facturas.monto})::float`,
      })
      .from(facturas)
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
          ne(facturas.sucursalId, sucursalId),
        ),
      )
      .groupBy(facturas.sucursalId);

    const ventaPorSucursal = new Map(paresVenta.map((v) => [v.sucursalId, Number(v.venta ?? 0)]));
    const cumplimientosPares = paresPresupuesto
      .filter((p) => Number(p.presupuesto) > 0)
      .map((p) => ((ventaPorSucursal.get(p.sucursalId) ?? 0) / Number(p.presupuesto)) * 100);

    const [gRes] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${facturas.monto}), 0)::float`,
        cantidad: sql<number>`COUNT(*)::int`,
      })
      .from(facturas)
      .where(
        and(sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`, ne(facturas.sucursalId, sucursalId)),
      );
    const ticketPromedioGrupo = gRes && gRes.cantidad > 0 ? gRes.total / gRes.cantidad : 0;

    const scoreResult = calcularScoreCompuesto({ puntos, ticketPropio, ticketPromedioGrupo });
    const percentil = percentilEnGrupo(scoreResult.cumplimiento, cumplimientosPares);

    const [sucursalRow] = await tx
      .select({ nombre: sucursales.nombre })
      .from(sucursales)
      .where(eq(sucursales.id, sucursalId));

    return {
      sucursal: sucursalRow?.nombre ?? "Sucursal",
      anio,
      puntos,
      ticketPropio,
      ticketPromedioGrupo,
      cantidadPares: cumplimientosPares.length,
      percentilVsPares: percentil,
      score: scoreResult,
    };
  });
}

/**
 * Evaluación de desempeño de una unidad de negocio.
 * Sin comparación entre unidades (no tiene sentido comparar Repuestos vs.
 * Alquiler) — en su lugar, tendencia + desglose de cumplimiento por sucursal
 * dentro de esa unidad. El alcance de sucursales lo determina el RLS del rol
 * (coordinador: su sucursal; gerente_comercial/gerencia: todas las visibles).
 */
export async function getEvaluacionUnidadAction(anio: number, unidadNegocioId: string) {
  return withAuth(async ({ tx, role }) => {
    if (role === "asesor") {
      throw new Error("Esta evaluación no está disponible para el rol asesor");
    }

    const propio = await tx
      .select({
        mes: presupuestos.mes,
        presupuesto: sql<number>`SUM(${presupuestos.monto})::float`,
      })
      .from(presupuestos)
      .where(and(eq(presupuestos.anio, anio), eq(presupuestos.unidadNegocioId, unidadNegocioId)))
      .groupBy(presupuestos.mes);

    const ventasPorMes = await tx
      .select({
        mes: sql<number>`EXTRACT(MONTH FROM ${facturas.fecha})::int`,
        venta: sql<number>`SUM(${facturas.monto})::float`,
      })
      .from(facturas)
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
          eq(facturas.unidadNegocioId, unidadNegocioId),
        ),
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${facturas.fecha})`);

    const ventaPorMesMap = new Map(ventasPorMes.map((v) => [v.mes, Number(v.venta ?? 0)]));
    const puntos: MonthlyPoint[] = propio.map((r) => ({
      mes: r.mes,
      venta: ventaPorMesMap.get(r.mes) ?? 0,
      presupuesto: Number(r.presupuesto ?? 0),
    }));

    // Desglose por sucursal dentro de esta unidad (reemplaza la comparación de pares).
    const presPorSucursal = await tx
      .select({
        sucursalId: presupuestos.sucursalId,
        presupuesto: sql<number>`SUM(${presupuestos.monto})::float`,
      })
      .from(presupuestos)
      .where(and(eq(presupuestos.anio, anio), eq(presupuestos.unidadNegocioId, unidadNegocioId)))
      .groupBy(presupuestos.sucursalId);

    const ventaPorSucursal = await tx
      .select({
        sucursalId: facturas.sucursalId,
        venta: sql<number>`SUM(${facturas.monto})::float`,
      })
      .from(facturas)
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
          eq(facturas.unidadNegocioId, unidadNegocioId),
        ),
      )
      .groupBy(facturas.sucursalId);

    const ventaMap = new Map(ventaPorSucursal.map((v) => [v.sucursalId, Number(v.venta ?? 0)]));
    const sucursalIds = presPorSucursal
      .map((p) => p.sucursalId)
      .filter((id): id is string => !!id);
    const sucursalNombres = sucursalIds.length
      ? await tx
          .select({ id: sucursales.id, nombre: sucursales.nombre })
          .from(sucursales)
          .where(inArray(sucursales.id, sucursalIds))
      : [];
    const nombreMap = new Map(sucursalNombres.map((s) => [s.id, s.nombre]));

    const desglosePorSucursal = presPorSucursal
      .filter((p) => p.sucursalId && Number(p.presupuesto) > 0)
      .map((p) => {
        const venta = ventaMap.get(p.sucursalId!) ?? 0;
        const presupuesto = Number(p.presupuesto);
        return {
          sucursal: nombreMap.get(p.sucursalId!) ?? "Sucursal",
          venta,
          presupuesto,
          cumplimiento: (venta / presupuesto) * 100,
        };
      })
      .sort((a, b) => b.cumplimiento - a.cumplimiento);

    // Ticket promedio de la unidad completa (sin comparación entre unidades).
    const [ticketRes] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${facturas.monto}), 0)::float`,
        cantidad: sql<number>`COUNT(*)::int`,
      })
      .from(facturas)
      .where(
        and(
          eq(facturas.unidadNegocioId, unidadNegocioId),
          sql`EXTRACT(YEAR FROM ${facturas.fecha}) = ${anio}`,
        ),
      );
    const ticketPropio = ticketRes && ticketRes.cantidad > 0 ? ticketRes.total / ticketRes.cantidad : 0;
    // Sin grupo de comparación entre unidades: el score de ticket usa el propio
    // ticket como referencia (ratio 1 = score 50, ni premia ni penaliza).
    const scoreResult = calcularScoreCompuesto({
      puntos,
      ticketPropio,
      ticketPromedioGrupo: ticketPropio,
    });

    const [unidadRow] = await tx
      .select({ nombre: unidadesNegocio.nombre })
      .from(unidadesNegocio)
      .where(eq(unidadesNegocio.id, unidadNegocioId));

    return {
      unidad: unidadRow?.nombre ?? "Unidad de Negocio",
      anio,
      puntos,
      ticketPropio,
      desglosePorSucursal,
      score: scoreResult,
    };
  });
}
