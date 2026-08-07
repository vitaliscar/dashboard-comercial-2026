"use server";

import { asc, eq, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  clientesPotenciales,
  mercadeoCanales,
  mercadeoGoogleBusiness,
  mercadeoInstagram,
  mercadeoPostHistorias,
  sucursales,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import type { MonthFilter } from "@/lib/date-range";
import {
  computeEmbudoEstatus,
  computeLeadsResumen,
  type LeadsResumen,
} from "@/lib/analytics/clientes-potenciales";

/**
 * Server actions del módulo Mercadeo.
 *
 * Las 4 tablas de métricas están gateadas por RLS a `gerencia`
 * (0007_mercadeo_rls.sql): para cualquier otro rol la query devuelve 0 filas,
 * no un error. clientes_potenciales admite además gerente_comercial, y el
 * acotado por unidad se hace acá (tipo_negocio es texto libre, no hay FK que
 * pueda evaluar la RLS).
 */

/**
 * Traduce el filtro de meses del FilterHeader a una condición Drizzle. Recibe
 * la columna genérica (`PgColumn`) y no `typeof mercadeoCanales.mes`, porque
 * las columnas `mes` de cada tabla son tipos nominalmente distintos en Drizzle
 * y el helper se usa con las cuatro.
 */
function condMeses(columna: PgColumn, meses: MonthFilter) {
  return Array.isArray(meses) && meses.length > 0 ? inArray(columna, meses) : undefined;
}

/**
 * Mercadeo (incluyendo Clientes Potenciales) no pasa a producción en ningún
 * rol ni vista. Defensa en profundidad: bloquea el action aunque alguien
 * invoque el server action directo sin pasar por la UI gateada.
 */
function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Módulo Mercadeo no disponible en producción");
  }
}

export async function getMercadeoCanalesAction(data: { meses: MonthFilter }) {
  assertNotProduction();
  return withAuth(({ tx }) =>
    tx
      .select({
        canal: mercadeoCanales.canal,
        tipo: mercadeoCanales.tipo,
        mes: mercadeoCanales.mes,
        cantidad: mercadeoCanales.cantidad,
      })
      .from(mercadeoCanales)
      .where(condMeses(mercadeoCanales.mes, data.meses))
      .orderBy(asc(mercadeoCanales.mes)),
  );
}

export async function getMercadeoInstagramAction(data: { meses: MonthFilter }) {
  assertNotProduction();
  return withAuth(({ tx }) =>
    tx
      .select({
        tipo: mercadeoInstagram.tipo,
        mes: mercadeoInstagram.mes,
        cantidad: mercadeoInstagram.cantidad,
      })
      .from(mercadeoInstagram)
      .where(condMeses(mercadeoInstagram.mes, data.meses))
      .orderBy(asc(mercadeoInstagram.mes)),
  );
}

/** Join con sucursales para devolver el nombre ya resuelto (incluye San Cristóbal). */
export async function getMercadeoGoogleBusinessAction(data: { meses: MonthFilter }) {
  assertNotProduction();
  return withAuth(({ tx }) =>
    tx
      .select({
        sucursal: sucursales.nombre,
        mes: mercadeoGoogleBusiness.mes,
        tipo: mercadeoGoogleBusiness.tipo,
        cantidad: mercadeoGoogleBusiness.cantidad,
      })
      .from(mercadeoGoogleBusiness)
      .leftJoin(sucursales, eq(sucursales.id, mercadeoGoogleBusiness.sucursalId))
      .where(condMeses(mercadeoGoogleBusiness.mes, data.meses))
      .orderBy(asc(mercadeoGoogleBusiness.mes)),
  );
}

export async function getMercadeoPostHistoriasAction(data: { meses: MonthFilter }) {
  assertNotProduction();
  return withAuth(({ tx }) =>
    tx
      .select({
        tipoPublicacion: mercadeoPostHistorias.tipoPublicacion,
        unidadNegocio: mercadeoPostHistorias.unidadNegocio,
        marca: mercadeoPostHistorias.marca,
        mes: mercadeoPostHistorias.mes,
        cantidad: mercadeoPostHistorias.cantidad,
      })
      .from(mercadeoPostHistorias)
      .where(condMeses(mercadeoPostHistorias.mes, data.meses))
      .orderBy(asc(mercadeoPostHistorias.mes)),
  );
}

/** Valor de clientes_potenciales.tipo_negocio asociado a cada unidad de negocio. */
export type UnidadNegocioLead =
  "Repuestos" | "Servicios" | "Equipos" | "Alquiler" | "Lubricantes/Filtros";

/**
 * Agregados de clientes potenciales para la sección embebida en las páginas de
 * unidad. **Nunca** selecciona columnas de contacto (correo, teléfono,
 * identificación fiscal, razón social, nombre de contacto): la decisión de no
 * exponer PII vive acá, no en la UI.
 *
 * Nota de datos: hoy el Excel no trae ningún tipo_negocio equivalente a
 * "Lubricantes/Filtros", así que /lubfiltros verá totales en cero hasta que
 * aparezca esa data. No es un bug.
 */
export async function getClientesPotencialesResumenAction(data: {
  unidad?: UnidadNegocioLead;
}): Promise<{ resumen: LeadsResumen; embudo: { estatus: string; cantidad: number }[] }> {
  assertNotProduction();
  return withAuth(async ({ tx }) => {
    const rows = await tx
      .select({
        estatusBis: clientesPotenciales.estatusBis,
        etapaOportunidad: clientesPotenciales.etapaOportunidad,
        ingresosEsperados: clientesPotenciales.ingresosEsperados,
        montoFacturadoBase: clientesPotenciales.montoFacturadoBase,
      })
      .from(clientesPotenciales)
      .where(data.unidad ? eq(clientesPotenciales.tipoNegocio, data.unidad) : undefined);

    const leads = rows.map((r) => ({
      estatusBis: r.estatusBis,
      etapaOportunidad: r.etapaOportunidad,
      ingresosEsperados: Number(r.ingresosEsperados ?? 0),
      montoFacturadoBase: Number(r.montoFacturadoBase ?? 0),
    }));

    return { resumen: computeLeadsResumen(leads), embudo: computeEmbudoEstatus(leads) };
  });
}

export interface LeadDetalle {
  id: string;
  idClientePotencial: number | null;
  sucursal: string | null;
  tipoNegocio: string | null;
  razonSocial: string | null;
  nombreContacto: string | null;
  correo: string | null;
  telefono: string | null;
  fechaDetectada: string | null;
  estatusBis: string | null;
  etapaOportunidad: string | null;
  tomaContacto: string | null;
  campana: string | null;
  usuarioAsignado: string | null;
  ingresosEsperados: number;
  montoFacturadoBase: number;
}

/**
 * Detalle completo con datos de contacto — alimenta la tabla de /mercadeo.
 * Doble gate: RLS (gerencia + gerente_comercial) más este chequeo explícito de
 * rol, porque acá sí viaja PII y gerente_comercial no debe verla.
 */
export async function getClientesPotencialesDetalleAction(data: {
  anio: number;
  meses: MonthFilter;
}): Promise<LeadDetalle[]> {
  assertNotProduction();
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") return [];

    const rows = await tx
      .select({
        id: clientesPotenciales.id,
        idClientePotencial: clientesPotenciales.idClientePotencial,
        sucursal: sucursales.nombre,
        tipoNegocio: clientesPotenciales.tipoNegocio,
        razonSocial: clientesPotenciales.razonSocial,
        nombreContacto: clientesPotenciales.nombreContacto,
        correo: clientesPotenciales.correo,
        telefono: clientesPotenciales.telefono,
        fechaDetectada: clientesPotenciales.fechaDetectada,
        estatusBis: clientesPotenciales.estatusBis,
        etapaOportunidad: clientesPotenciales.etapaOportunidad,
        tomaContacto: clientesPotenciales.tomaContacto,
        campana: clientesPotenciales.campana,
        usuarioAsignado: clientesPotenciales.usuarioAsignado,
        ingresosEsperados: clientesPotenciales.ingresosEsperados,
        montoFacturadoBase: clientesPotenciales.montoFacturadoBase,
      })
      .from(clientesPotenciales)
      .leftJoin(sucursales, eq(sucursales.id, clientesPotenciales.sucursalId))
      .orderBy(clientesPotenciales.fechaDetectada);

    // fecha_detectada es DATE; el filtro de año/mes se aplica en memoria
    // porque son ~1.000 filas y así no se duplica lógica de rangos SQL.
    const mesesPermitidos = Array.isArray(data.meses) ? new Set(data.meses) : null;
    return rows
      .filter((r) => {
        if (!r.fechaDetectada) return mesesPermitidos === null;
        const [anio, mes] = r.fechaDetectada.split("-").map(Number);
        if (anio !== data.anio) return false;
        return mesesPermitidos === null || mesesPermitidos.has(mes);
      })
      .map((r) => ({
        ...r,
        ingresosEsperados: Number(r.ingresosEsperados ?? 0),
        montoFacturadoBase: Number(r.montoFacturadoBase ?? 0),
      }));
  });
}
