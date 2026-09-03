"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { cotizaciones, cumplimientoAsesores, presupuestos, sucursales, ventasPerdidas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import type { MonthlyPoint } from "@/lib/performance-score";

export type ReporteFiltros = {
  anio: number;
  /** Array vacío = todos los meses disponibles en los datos. */
  meses: number[];
  /** Array vacío = todas las sucursales visibles para el rol (RLS decide el alcance real). */
  sucursalIds: string[];
  /** Array vacío = todas las unidades visibles para el rol. */
  unidadNegocioIds: string[];
};

export type Hallazgo = { tipo: "good" | "bad" | "warn"; titulo: string; texto: string };

/**
 * Reporte de cumplimiento filtrable (mes(es)/sucursal(es)/unidad(es)) que
 * reemplaza las 3 páginas fijas de evaluación (asesor/sucursal/unidad). El
 * alcance real de sucursales/unidades/asesores lo sigue decidiendo el RLS de
 * Postgres (withAuth ya setea app.current_role/sucursal_id) -- esta acción
 * solo agrega la dimensión de filtrado ad-hoc que pidió el usuario. La UI es
 * la que oculta/bloquea selectores según el rol (ver EvaluacionFiltros).
 */
export async function getReporteCumplimientoAction(filtros: ReporteFiltros) {
  return withAuth(async ({ tx, role, profile, userId }) => {
    if (!role) throw new Error("El usuario no tiene un rol asignado");

    if (role === "asesor") {
      return getReporteAsesorPropio(tx, userId, filtros);
    }

    const mesesFiltro = filtros.meses.length > 0 ? filtros.meses : undefined;
    const condiciones = [eq(presupuestos.anio, filtros.anio)];
    if (mesesFiltro) condiciones.push(inArray(presupuestos.mes, mesesFiltro));
    if (filtros.sucursalIds.length > 0) condiciones.push(inArray(presupuestos.sucursalId, filtros.sucursalIds));
    if (filtros.unidadNegocioIds.length > 0)
      condiciones.push(inArray(presupuestos.unidadNegocioId, filtros.unidadNegocioIds));

    const rows = await tx
      .select({
        mes: presupuestos.mes,
        sucursalId: presupuestos.sucursalId,
        unidadNegocioId: presupuestos.unidadNegocioId,
        monto: presupuestos.monto,
        ventasCcv: presupuestos.ventasCcv,
        ventasXibi: presupuestos.ventasXibi,
        ventasEstrategicas: presupuestos.ventasEstrategicas,
      })
      .from(presupuestos)
      .where(and(...condiciones));

    let totalVenta = 0;
    let totalMeta = 0;
    const porSucursal = new Map<string, { meta: number; venta: number }>();
    const porSucursalMes = new Map<string, { meta: number; venta: number }>();

    rows.forEach((r) => {
      const venta = Number(r.ventasCcv ?? 0) + Number(r.ventasXibi ?? 0) + Number(r.ventasEstrategicas ?? 0);
      const meta = Number(r.monto ?? 0);
      totalVenta += venta;
      totalMeta += meta;
      if (!r.sucursalId) return;
      const s = porSucursal.get(r.sucursalId) ?? { meta: 0, venta: 0 };
      s.meta += meta;
      s.venta += venta;
      porSucursal.set(r.sucursalId, s);

      const clave = `${r.sucursalId}|${r.mes}`;
      const sm = porSucursalMes.get(clave) ?? { meta: 0, venta: 0 };
      sm.meta += meta;
      sm.venta += venta;
      porSucursalMes.set(clave, sm);
    });

    const sucursalIds = [...porSucursal.keys()];
    const sucursalRows = sucursalIds.length
      ? await tx.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales).where(inArray(sucursales.id, sucursalIds))
      : [];
    const nombreSucursal = new Map(sucursalRows.map((s) => [s.id, s.nombre]));

    const ranking = [...porSucursal.entries()]
      .map(([id, v]) => ({
        id,
        label: nombreSucursal.get(id) ?? "Sucursal",
        meta: v.meta,
        facturado: v.venta,
        pct: v.meta > 0 ? (v.venta / v.meta) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    const mesesUsados = mesesFiltro ?? [...new Set(rows.map((r) => r.mes))].sort((a, b) => a - b);
    const heatmap = ranking.map((r) => ({
      sucursal: r.label,
      celdas: mesesUsados.map((m) => {
        const sm = porSucursalMes.get(`${r.id}|${m}`);
        return { mes: m, pct: sm && sm.meta > 0 ? (sm.venta / sm.meta) * 100 : null };
      }),
    }));

    const cumplimientoGeneral = totalMeta > 0 ? (totalVenta / totalMeta) * 100 : 0;
    const bajo70 = ranking.filter((r) => r.pct < 70);
    const mejor = ranking[0] ?? null;
    const peor = ranking.length > 1 ? ranking[ranking.length - 1] : null;

    const hallazgos: Hallazgo[] = [
      mejor
        ? { tipo: "good", titulo: "Mejor desempeño", texto: `${mejor.label} lidera con ${mejor.pct.toFixed(1)}% de cumplimiento.` }
        : null,
      bajo70.length > 0
        ? {
            tipo: "bad",
            titulo: "Sucursales bajo 70%",
            texto: `${bajo70.length} de ${ranking.length} sucursales están bajo el 70% de cumplimiento.`,
          }
        : { tipo: "good", titulo: "Todas sobre 70%", texto: "Ninguna sucursal está por debajo del umbral crítico." },
      peor && peor.id !== mejor?.id
        ? { tipo: "warn", titulo: "Necesita atención", texto: `${peor.label} tiene el cumplimiento más bajo (${peor.pct.toFixed(1)}%).` }
        : null,
    ].filter((h): h is Hallazgo => h !== null);

    return {
      tipo: "sucursal" as const,
      anio: filtros.anio,
      meses: mesesUsados,
      cumplimientoGeneral,
      totalVenta,
      totalMeta,
      ranking,
      heatmap,
      hallazgos,
    };
  });
}

type Tx = Parameters<Parameters<typeof withAuth>[0]>[0]["tx"];

async function getReporteAsesorPropio(tx: Tx, userId: string, filtros: ReporteFiltros) {
  const mesesFiltro = filtros.meses.length > 0 ? filtros.meses : undefined;
  const condiciones = [eq(cumplimientoAsesores.anio, filtros.anio), eq(cumplimientoAsesores.asesorId, userId)];
  if (mesesFiltro) condiciones.push(inArray(cumplimientoAsesores.mes, mesesFiltro));
  if (filtros.unidadNegocioIds.length > 0)
    condiciones.push(inArray(cumplimientoAsesores.unidadNegocioId, filtros.unidadNegocioIds));

  const rows = await tx
    .select({
      mes: cumplimientoAsesores.mes,
      unidadNegocioId: cumplimientoAsesores.unidadNegocioId,
      venta: cumplimientoAsesores.venta,
      presupuesto: cumplimientoAsesores.presupuesto,
    })
    .from(cumplimientoAsesores)
    .where(and(...condiciones));

  let totalVenta = 0;
  let totalMeta = 0;
  const porMes = new Map<number, { meta: number; venta: number }>();
  rows.forEach((r) => {
    const venta = Number(r.venta ?? 0);
    const meta = Number(r.presupuesto ?? 0);
    totalVenta += venta;
    totalMeta += meta;
    const m = porMes.get(r.mes) ?? { meta: 0, venta: 0 };
    m.meta += meta;
    m.venta += venta;
    porMes.set(r.mes, m);
  });

  const mesesUsados = mesesFiltro ?? [...new Set(rows.map((r) => r.mes))].sort((a, b) => a - b);
  const puntos: MonthlyPoint[] = mesesUsados.map((mes) => {
    const m = porMes.get(mes) ?? { meta: 0, venta: 0 };
    return { mes, venta: m.venta, presupuesto: m.meta };
  });

  const cumplimientoGeneral = totalMeta > 0 ? (totalVenta / totalMeta) * 100 : 0;
  const hallazgos: Hallazgo[] = [
    {
      tipo: cumplimientoGeneral >= 90 ? "good" : cumplimientoGeneral >= 70 ? "warn" : "bad",
      titulo: "Tu cumplimiento del período",
      texto: `${cumplimientoGeneral.toFixed(1)}% de la meta asignada en los meses seleccionados.`,
    },
  ];

  return {
    tipo: "asesor" as const,
    anio: filtros.anio,
    meses: mesesUsados,
    cumplimientoGeneral,
    totalVenta,
    totalMeta,
    puntos,
    hallazgos,
  };
}

export type GestionAsesorFila = {
  codigoAsesor: string;
  asesor: string;
  cotizado: number;
  clientesCotizados: number;
  facturado: number;
  presupuesto: number;
  perdido: number;
  clientesPerdidos: number;
  tasaConversion: number; // facturado / cotizado
  tasaPerdida: number; // perdido / cotizado
  cumplimiento: number; // facturado / presupuesto
  scorePonderado: number;
};

/**
 * Análisis ponderado de gestión del asesor: cotizado -> facturado -> perdido,
 * más capacidad de negociación (tasa de conversión / tasa de pérdida).
 * Pedido explícito del usuario 2026-09-03, visible SOLO para gerencia,
 * gerente_comercial y coordinador (nunca el propio asesor).
 *
 * Fuentes:
 * - Cotizado + clientes cotizados: tabla `cotizaciones` (agrupado por
 *   asesor_codigo, ~98% de las filas de agosto lo traen).
 * - Facturado + presupuesto: `cumplimiento_asesores` (ya reconciliado con la
 *   metodología exacta de esta sesión -- NO se usa cotizaciones.monto_facturado,
 *   ese campo del loader legado no correlaciona con la venta real: un asesor
 *   con $1,9M cotizado mostraba $167 ahí).
 * - Perdido + clientes perdidos: `ventas_perdidas`, emparejado por NOMBRE de
 *   asesor (columna de texto, 100% llena en agosto) contra el nombre en
 *   cumplimiento_asesores -- ventas_perdidas.asesor_id solo está lleno ~98%
 *   pero no hay forma de cruzarlo con codigo_asesor sin ese id, así que se usa
 *   el nombre normalizado (trim + lowercase) como llave de emparejamiento.
 *
 * Gap conocido: "clientes facturados" (para completar el trío cotizado/
 * facturado/perdido en cantidad de clientes, no solo monto) no está
 * disponible -- facturas.asesor_id viene vacío en el 100% de las filas
 * cargadas por los scripts AS400 de esta sesión (ver load-facturas-as400.ts).
 * Se omite en vez de inventar un número.
 *
 * Score ponderado = 40% cumplimiento + 35% tasa de conversión + 25% (1 - tasa
 * de pérdida), cada componente normalizado a 0-100 y capado a 100 antes de
 * ponderar (un asesor con 300% de cumplimiento no debe pesar 3x más que uno
 * al 100%).
 */
export async function getGestionAsesoresAction(filtros: ReporteFiltros) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia" && role !== "gerente_comercial" && role !== "coordinador") {
      throw new Error("Este análisis no está disponible para tu rol");
    }

    const mesesFiltro = filtros.meses.length > 0 ? filtros.meses : undefined;

    const condicionesCot = [sql`EXTRACT(YEAR FROM ${cotizaciones.fecha}) = ${filtros.anio}`];
    if (mesesFiltro) condicionesCot.push(sql`EXTRACT(MONTH FROM ${cotizaciones.fecha}) = ANY(${mesesFiltro})`);
    if (filtros.unidadNegocioIds.length > 0)
      condicionesCot.push(inArray(cotizaciones.unidadNegocioId, filtros.unidadNegocioIds));

    const cotRows = await tx
      .select({
        codigo: cotizaciones.asesorCodigo,
        cliente: cotizaciones.cliente,
        monto: cotizaciones.monto,
      })
      .from(cotizaciones)
      .where(and(...condicionesCot));

    const cotizadoPorCodigo = new Map<string, { monto: number; clientes: Set<string> }>();
    cotRows.forEach((r) => {
      if (!r.codigo) return;
      const acc = cotizadoPorCodigo.get(r.codigo) ?? { monto: 0, clientes: new Set<string>() };
      acc.monto += Number(r.monto ?? 0);
      acc.clientes.add(r.cliente);
      cotizadoPorCodigo.set(r.codigo, acc);
    });

    const condicionesVp = [sql`EXTRACT(YEAR FROM ${ventasPerdidas.fecha}) = ${filtros.anio}`];
    if (mesesFiltro) condicionesVp.push(sql`EXTRACT(MONTH FROM ${ventasPerdidas.fecha}) = ANY(${mesesFiltro})`);
    if (filtros.unidadNegocioIds.length > 0)
      condicionesVp.push(inArray(ventasPerdidas.unidadNegocioId, filtros.unidadNegocioIds));
    const vpRows = await tx
      .select({ asesor: ventasPerdidas.asesor, cliente: ventasPerdidas.cliente, monto: ventasPerdidas.monto })
      .from(ventasPerdidas)
      .where(and(...condicionesVp));

    const perdidoPorNombre = new Map<string, { monto: number; clientes: Set<string> }>();
    vpRows.forEach((r) => {
      const clave = (r.asesor ?? "").trim().toLowerCase();
      if (!clave) return;
      const acc = perdidoPorNombre.get(clave) ?? { monto: 0, clientes: new Set<string>() };
      acc.monto += Number(r.monto ?? 0);
      acc.clientes.add(r.cliente);
      perdidoPorNombre.set(clave, acc);
    });

    const condicionesCa = [eq(cumplimientoAsesores.anio, filtros.anio)];
    if (mesesFiltro) condicionesCa.push(inArray(cumplimientoAsesores.mes, mesesFiltro));
    if (filtros.unidadNegocioIds.length > 0)
      condicionesCa.push(inArray(cumplimientoAsesores.unidadNegocioId, filtros.unidadNegocioIds));
    const caRows = await tx
      .select({
        codigo: cumplimientoAsesores.codigoAsesor,
        asesor: cumplimientoAsesores.asesor,
        venta: cumplimientoAsesores.venta,
        presupuesto: cumplimientoAsesores.presupuesto,
      })
      .from(cumplimientoAsesores)
      .where(and(...condicionesCa));

    const facturadoPorCodigo = new Map<string, { asesor: string; venta: number; presupuesto: number }>();
    caRows.forEach((r) => {
      const acc = facturadoPorCodigo.get(r.codigo) ?? { asesor: r.asesor, venta: 0, presupuesto: 0 };
      acc.venta += Number(r.venta ?? 0);
      acc.presupuesto += Number(r.presupuesto ?? 0);
      facturadoPorCodigo.set(r.codigo, acc);
    });

    const codigos = new Set([...cotizadoPorCodigo.keys(), ...facturadoPorCodigo.keys()]);
    const filas: GestionAsesorFila[] = [...codigos].map((codigo) => {
      const cot = cotizadoPorCodigo.get(codigo) ?? { monto: 0, clientes: new Set<string>() };
      const fact = facturadoPorCodigo.get(codigo) ?? { asesor: codigo, venta: 0, presupuesto: 0 };
      const nombreClave = fact.asesor.trim().toLowerCase();
      const perdido = perdidoPorNombre.get(nombreClave) ?? { monto: 0, clientes: new Set<string>() };

      const tasaConversion = cot.monto > 0 ? (fact.venta / cot.monto) * 100 : 0;
      const tasaPerdida = cot.monto > 0 ? (perdido.monto / cot.monto) * 100 : 0;
      const cumplimiento = fact.presupuesto > 0 ? (fact.venta / fact.presupuesto) * 100 : 0;

      const scorePonderado =
        Math.min(cumplimiento, 100) * 0.4 + Math.min(tasaConversion, 100) * 0.35 + (100 - Math.min(tasaPerdida, 100)) * 0.25;

      return {
        codigoAsesor: codigo,
        asesor: fact.asesor,
        cotizado: cot.monto,
        clientesCotizados: cot.clientes.size,
        facturado: fact.venta,
        presupuesto: fact.presupuesto,
        perdido: perdido.monto,
        clientesPerdidos: perdido.clientes.size,
        tasaConversion,
        tasaPerdida,
        cumplimiento,
        scorePonderado,
      };
    });

    filas.sort((a, b) => b.scorePonderado - a.scorePonderado);

    return { anio: filtros.anio, meses: filtros.meses, filas };
  });
}
