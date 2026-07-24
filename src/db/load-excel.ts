/**
 * Excel Data Load Service — Postgres 18 + Drizzle
 * Reemplaza src/integrations/supabase/load-excel.ts (Supabase).
 * DELETE + INSERT completo por corrida (patrón semanal).
 *
 * users/profiles/user_roles se siembran directamente en Postgres (ya no hay
 * Supabase Auth): cada usuario nuevo recibe un password temporal aleatorio,
 * hasheado con argon2id — nunca queda en texto plano ni es adivinable.
 */

import path from "path";
import { hash as argon2Hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import {
  users,
  profiles,
  userRoles,
  sucursales,
  unidadesNegocio,
  cotizaciones,
  facturas,
  ventasPerdidas,
  presupuestos,
  cobranzas,
  cobranzasEquipos,
  servicios,
  equiposInventario,
  equiposPorMarca,
  equiposFacturacionSucursal,
  equiposPresupuesto,
  equiposFacturacion,
  cumplimientoAsesores,
} from "@/db/schema";
import {
  ExcelParser,
  mapRolToAppRole,
  SUCURSALES_CANONICAS,
  UNIDADES_CANONICAS,
  UNIDAD_EQUIPOS,
  UNIDAD_ALQUILER,
  UNIDAD_EQUIPOS_ALQUILER,
  type Cotizacion,
  type FacturaNueva,
  type VentaPerdidaNueva,
} from "@/lib/excel-parser";

interface LoadResult {
  success: boolean;
  timestamp: string;
  rowsAffected: Record<string, number>;
  errors: string[];
}

function generateTemporaryPassword(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function byNormalizedName<T extends { nombre: string; id: string }>(
  rows: T[],
): Map<string, string> {
  const map = new Map<string, string>();
  rows.forEach((r) => map.set(r.nombre.trim().toLowerCase(), r.id));
  return map;
}

/** Sucursales y unidades_negocio: upsert idempotente por nombre. */
async function seedCatalogos(): Promise<{
  sucursales: Map<string, string>;
  unidades: Map<string, string>;
}> {
  await dbAdmin
    .insert(sucursales)
    .values(SUCURSALES_CANONICAS.map((nombre) => ({ nombre })))
    .onConflictDoNothing({ target: sucursales.nombre });

  await dbAdmin
    .insert(unidadesNegocio)
    .values(UNIDADES_CANONICAS.map((nombre) => ({ nombre })))
    .onConflictDoNothing({ target: unidadesNegocio.nombre });

  // Eliminar la fila legacy combinada "Equipos/Alquiler" ahora que existen
  // entradas separadas "Equipos" y "Alquiler".
  await dbAdmin.delete(unidadesNegocio).where(eq(unidadesNegocio.nombre, UNIDAD_EQUIPOS_ALQUILER));

  const [sucursalesRows, unidadesRows] = await Promise.all([
    dbAdmin.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales),
    dbAdmin
      .select({ id: unidadesNegocio.id, nombre: unidadesNegocio.nombre })
      .from(unidadesNegocio),
  ]);

  return {
    sucursales: byNormalizedName(sucursalesRows),
    unidades: byNormalizedName(unidadesRows),
  };
}

/**
 * Crea (o reutiliza) un `users` real por cada fila de la hoja Usuarios y
 * sincroniza profiles/user_roles. Devuelve mapas para resolver asesor_id.
 */
async function seedUsuarios(
  parser: ExcelParser,
  sucursalesMap: Map<string, string>,
  unidadesMap: Map<string, string>,
): Promise<{
  asesorIdPorNombre: Map<string, string>;
  count: number;
  userProfiles: Array<{ id: string; nombre_completo: string }>;
}> {
  const usuarios = parser.getUsuarios();
  const asesorIdPorNombre = new Map<string, string>();
  const userProfiles: Array<{ id: string; nombre_completo: string }> = [];
  let count = 0;

  for (const u of usuarios) {
    if (!u.email) continue;

    const existing = await dbAdmin
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, u.email))
      .limit(1);

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const passwordHash = await argon2Hash(u.contraseña || generateTemporaryPassword());
      const [created] = await dbAdmin
        .insert(users)
        .values({ email: u.email, passwordHash })
        .returning({ id: users.id });
      userId = created.id;
      await dbAdmin.insert(profiles).values({ id: userId, email: u.email });
    }

    const sucursalId = sucursalesMap.get(u.sucursal.trim().toLowerCase()) ?? null;
    const { role, unidadNegocio } = mapRolToAppRole(u.rol);
    const unidadNombre = unidadNegocio ?? u.unidadesNegocio?.[0] ?? null;
    const unidadId = unidadNombre
      ? (unidadesMap.get(unidadNombre.trim().toLowerCase()) ?? null)
      : null;

    await dbAdmin
      .update(profiles)
      .set({ nombreCompleto: u.nombre, sucursalId, unidadNegocioId: unidadId })
      .where(eq(profiles.id, userId));

    await dbAdmin.delete(userRoles).where(eq(userRoles.userId, userId));
    await dbAdmin.insert(userRoles).values({ userId, role });

    userProfiles.push({ id: userId, nombre_completo: u.nombre });
    asesorIdPorNombre.set(u.nombre.trim().toLowerCase(), userId);
    count++;
  }

  return { asesorIdPorNombre, count, userProfiles };
}

function resolveFKs(
  row: { sucursal: string; unidadNegocio: string | null; asesor: string },
  sucursalesMap: Map<string, string>,
  unidadesMap: Map<string, string>,
  asesorIdPorNombre: Map<string, string>,
) {
  return {
    sucursalId: sucursalesMap.get(row.sucursal.trim().toLowerCase()) ?? null,
    unidadNegocioId: row.unidadNegocio
      ? (unidadesMap.get(row.unidadNegocio.trim().toLowerCase()) ?? null)
      : null,
    asesorId: asesorIdPorNombre.get(row.asesor.trim().toLowerCase()) ?? null,
  };
}

const normalizeName = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Carga completa del Excel a Postgres local (esquema Drizzle, Fase 2). */
export async function loadExcelToPostgres(excelSource: string | Buffer): Promise<LoadResult> {
  const result: LoadResult = {
    success: false,
    timestamp: new Date().toISOString(),
    rowsAffected: {},
    errors: [],
  };

  try {
    console.log("📊 Iniciando carga de Excel a Postgres local...");
    const parser = new ExcelParser(excelSource);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    console.log("→ Sembrando sucursales y unidades de negocio...");
    const { sucursales: sucursalesMap, unidades: unidadesMap } = await seedCatalogos();

    console.log("→ Cargando usuarios...");
    const {
      asesorIdPorNombre,
      count: usuariosCount,
      userProfiles,
    } = await seedUsuarios(parser, sucursalesMap, unidadesMap);
    result.rowsAffected["usuarios"] = usuariosCount;

    // Fuzzy-match de nombres de asesor en las transacciones contra userProfiles
    const uniqueAsesores = new Set<string>();
    [
      ...parser.getFacturasPrincipales().map((f) => f.asesor),
      ...parser.getFacturasLubFiltros().map((f) => f.asesor),
      ...parser.getCotizacionesPrincipales().map((c) => c.asesor),
      ...parser.getCotizacionesLubFiltros().map((c) => c.asesor),
      ...parser.getVentasPerdidasNuevo().map((v) => v.asesor),
      ...parser.getOportunidadesVentasPerdidasNuevo().map((v) => v.asesor),
    ].forEach((name) => {
      if (name) uniqueAsesores.add(name.trim());
    });

    for (const rawAsesor of uniqueAsesores) {
      const normAsesor = normalizeName(rawAsesor);
      const asesorWords = normAsesor.split(" ").filter((w) => w.length > 2);
      let bestMatch: { id: string; nombre_completo: string } | null = null;
      let maxMatchWords = 0;
      for (const p of userProfiles) {
        const normProfile = normalizeName(p.nombre_completo);
        const profileWords = normProfile.split(" ").filter((w) => w.length > 2);
        const intersection = asesorWords.filter((w) => profileWords.includes(w));
        if (intersection.length >= 2 || (intersection.length === 1 && profileWords.length === 1)) {
          if (intersection.length > maxMatchWords) {
            maxMatchWords = intersection.length;
            bestMatch = p;
          }
        }
      }
      if (bestMatch) asesorIdPorNombre.set(rawAsesor.trim().toLowerCase(), bestMatch.id);
    }

    // 3. Cotizaciones
    console.log("→ Cargando cotizaciones...");
    const cotizacionesRows: Cotizacion[] = [
      ...parser.getCotizacionesPrincipales(),
      ...parser.getCotizacionesLubFiltros(),
    ];
    await dbAdmin.delete(cotizaciones);
    result.rowsAffected["cotizaciones"] = await insertChunked(
      cotizaciones,
      cotizacionesRows
        .filter((c) => c.unidadNegocio !== null) // unidad_negocio_id NOT NULL
        .map((c) => ({
          fecha: c.fecha ?? today,
          cliente: c.cliente,
          asesorCodigo: c.asesorCodigo ?? null,
          nroCotizacion: c.nroCotizacion ?? null,
          descripcion: c.descripcion ?? null,
          monto: String(c.monto),
          montoFacturado: String(c.montoFacturado ?? 0),
          montoPerdido: String(c.montoPerdido ?? 0),
          etapa: c.etapa,
          ...resolveFKs(c, sucursalesMap, unidadesMap, asesorIdPorNombre),
        })),
    );

    // 4. Facturas
    console.log("→ Cargando facturas...");
    const facturasRows: FacturaNueva[] = [
      ...parser.getFacturasPrincipales(),
      ...parser.getFacturasLubFiltros(),
    ];
    await dbAdmin.delete(facturas);
    result.rowsAffected["facturas"] = await insertChunked(
      facturas,
      facturasRows.map((f) => ({
        fecha: f.fecha ?? today,
        numero: f.numero || null,
        cliente: f.cliente,
        asesor: f.asesor || null,
        monto: String(f.monto),
        ...resolveFKs(f, sucursalesMap, unidadesMap, asesorIdPorNombre),
      })),
    );

    // 5. Ventas perdidas
    console.log("→ Cargando ventas perdidas...");
    const ventasPerdidasRows: VentaPerdidaNueva[] = [
      ...parser.getVentasPerdidasNuevo(),
      ...parser.getOportunidadesVentasPerdidasNuevo(),
    ];
    await dbAdmin.delete(ventasPerdidas);
    result.rowsAffected["ventas_perdidas"] = await insertChunked(
      ventasPerdidas,
      ventasPerdidasRows.map((v) => ({
        fecha: v.fecha ?? today,
        cliente: v.cliente,
        asesor: v.asesor || null,
        monto: String(v.monto),
        razon: v.razon,
        ...resolveFKs(v, sucursalesMap, unidadesMap, asesorIdPorNombre),
      })),
    );

    // 6. Presupuestos, deduplicados por (anio, mes, sucursal, unidad)
    console.log("→ Cargando presupuestos...");
    const presupuestosRaw = parser.getPresupuestosNuevo();
    const presupuestosPorClave = new Map<
      string,
      {
        anio: number;
        mes: number;
        sucursalId: string | null;
        unidadNegocioId: string | null;
        monto: number;
        ventasCcv: number;
        ventasXibi: number;
        ventasEstrategicas: number;
      }
    >();
    presupuestosRaw.forEach((p) => {
      const sucursalId = sucursalesMap.get(p.sucursal.trim().toLowerCase()) ?? null;
      const unidadNegocioId = p.unidadNegocio
        ? (unidadesMap.get(p.unidadNegocio.trim().toLowerCase()) ?? null)
        : null;
      const key = `${p.anio}|${p.mes}|${sucursalId}|${unidadNegocioId}`;
      const existing = presupuestosPorClave.get(key);
      if (existing) {
        existing.monto += p.monto;
        existing.ventasCcv += p.ventasCCV;
        existing.ventasXibi += p.ventasXibi;
        existing.ventasEstrategicas += p.ventasEstrategicas;
      } else
        presupuestosPorClave.set(key, {
          anio: p.anio,
          mes: p.mes,
          sucursalId,
          unidadNegocioId,
          monto: p.monto,
          ventasCcv: p.ventasCCV,
          ventasXibi: p.ventasXibi,
          ventasEstrategicas: p.ventasEstrategicas,
        });
    });
    await dbAdmin.delete(presupuestos);
    result.rowsAffected["presupuestos"] = await insertChunked(
      presupuestos,
      Array.from(presupuestosPorClave.values()).map((p) => ({
        anio: p.anio,
        mes: p.mes,
        sucursalId: p.sucursalId,
        unidadNegocioId: p.unidadNegocioId,
        monto: String(p.monto),
        ventasCcv: String(p.ventasCcv),
        ventasXibi: String(p.ventasXibi),
        ventasEstrategicas: String(p.ventasEstrategicas),
      })),
    );

    // 7. Cobranzas + split a cobranzas_equipos
    // (cobranzas_snapshots queda fuera de alcance: no aplicada en producción,
    // diferida a una fase posterior — ver docs/SCHEMA.md).
    console.log("→ Cargando cobranzas...");
    const cobranzasRaw = parser.getCobranzasNuevo();
    await dbAdmin.delete(cobranzas);
    result.rowsAffected["cobranzas"] = await insertChunked(
      cobranzas,
      cobranzasRaw.map((c) => ({
        cliente: c.cliente,
        facturaNumero: c.facturaNumero || null,
        fechaEmision: c.fechaEmision ?? today,
        fechaVencimiento: c.fechaVencimiento ?? today,
        monto: String(c.monto),
        saldo: String(c.saldo),
        sucursalId: sucursalesMap.get(c.sucursal.trim().toLowerCase()) ?? null,
        unidadNegocioId: c.unidadNegocio
          ? (unidadesMap.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
          : null,
      })),
    );
    await dbAdmin.delete(cobranzasEquipos);
    result.rowsAffected["cobranzas_equipos"] = await insertChunked(
      cobranzasEquipos,
      cobranzasRaw
        .filter((c) => c.unidadNegocio === UNIDAD_EQUIPOS || c.unidadNegocio === UNIDAD_ALQUILER)
        .map((c) => ({
          cliente: c.cliente,
          monto: String(c.monto),
          saldo: String(c.saldo),
          sucursalId: sucursalesMap.get(c.sucursal.trim().toLowerCase()) ?? null,
        })),
    );

    // 8. Servicios
    console.log("→ Cargando servicios...");
    const serviciosRaw = parser.getServiciosNuevo();
    await dbAdmin.delete(servicios);
    result.rowsAffected["servicios"] = await insertChunked(
      servicios,
      serviciosRaw.map((s) => ({
        fecha: s.fecha ?? today,
        cliente: s.cliente,
        monto: String(s.monto),
        tipoServicio: s.tipoServicio || null,
        categoriaVenta: s.categoriaVenta || null,
        compania: s.compania || null,
        asesor: s.asesor || null,
        sucursalId: sucursalesMap.get(s.sucursal.trim().toLowerCase()) ?? null,
        unidadNegocioId: unidadesMap.get(s.unidadNegocio!.trim().toLowerCase()) ?? null,
      })),
    );

    // 9. Equipos: inventario (mes/año actual, snapshot semanal)
    console.log("→ Cargando inventario de equipos...");
    const equiposInventarioRaw = parser.getEquiposInventario();
    const unidadEquiposId = unidadesMap.get(UNIDAD_EQUIPOS.toLowerCase()) ?? null;
    await dbAdmin.delete(equiposInventario);
    result.rowsAffected["equipos_inventario"] = await insertChunked(
      equiposInventario,
      equiposInventarioRaw.map((e) => ({
        anio: now.getFullYear(),
        mes: now.getMonth() + 1,
        marca: e.marca,
        disponible: String(e.disponible),
        transito: String(e.transito),
        unidadNegocioId: unidadEquiposId,
      })),
    );

    // 10. Equipos: ventas por marca / por sucursal / mensual
    console.log("→ Cargando ventas de equipos...");
    const equiposDetalle = parser.getEquiposDetalleVentas();

    await dbAdmin.delete(equiposPorMarca);
    result.rowsAffected["equipos_por_marca"] = await insertChunked(
      equiposPorMarca,
      equiposDetalle.map((e) => ({
        anio: e.anio,
        mes: e.mes,
        marca: e.marca,
        monto: String(e.monto),
        sucursalId: sucursalesMap.get(e.sucursal.trim().toLowerCase()) ?? null,
        unidadNegocioId: unidadEquiposId,
      })),
    );

    const porSucursalMes = new Map<
      string,
      { anio: number; mes: number; sucursal: string; facturado: number }
    >();
    const porMes = new Map<string, { anio: number; mes: number; facturado: number }>();
    equiposDetalle.forEach((e) => {
      const keySuc = `${e.anio}|${e.mes}|${e.sucursal}`;
      const suc = porSucursalMes.get(keySuc);
      if (suc) suc.facturado += e.monto;
      else
        porSucursalMes.set(keySuc, {
          anio: e.anio,
          mes: e.mes,
          sucursal: e.sucursal,
          facturado: e.monto,
        });

      const keyMes = `${e.anio}|${e.mes}`;
      const m = porMes.get(keyMes);
      if (m) m.facturado += e.monto;
      else porMes.set(keyMes, { anio: e.anio, mes: e.mes, facturado: e.monto });
    });

    await dbAdmin.delete(equiposFacturacionSucursal);
    result.rowsAffected["equipos_facturacion_sucursal"] = await insertChunked(
      equiposFacturacionSucursal,
      Array.from(porSucursalMes.values()).map((r) => ({
        anio: r.anio,
        mes: r.mes,
        sucursal: r.sucursal,
        facturado: String(r.facturado),
        unidadNegocioId: unidadEquiposId,
      })),
    );

    // 11. Equipos: presupuesto anual
    const presupuestoEquiposPorAnio = new Map<number, number>();
    presupuestosRaw
      .filter((p) => p.unidadNegocio === UNIDAD_EQUIPOS || p.unidadNegocio === UNIDAD_ALQUILER)
      .forEach((p) =>
        presupuestoEquiposPorAnio.set(
          p.anio,
          (presupuestoEquiposPorAnio.get(p.anio) ?? 0) + p.monto,
        ),
      );

    await dbAdmin.delete(equiposPresupuesto);
    result.rowsAffected["equipos_presupuesto"] = await insertChunked(
      equiposPresupuesto,
      Array.from(presupuestoEquiposPorAnio.entries()).map(([anio, monto]) => ({
        anio,
        monto: String(monto),
        unidadNegocioId: unidadEquiposId,
      })),
    );

    await dbAdmin.delete(equiposFacturacion);
    result.rowsAffected["equipos_facturacion"] = await insertChunked(
      equiposFacturacion,
      Array.from(porMes.values()).map((r) => ({
        anio: r.anio,
        mes: r.mes,
        facturado: String(r.facturado),
        presupuesto: "0",
        unidadNegocioId: unidadEquiposId,
      })),
    );

    // 12. Cumplimiento por asesor
    console.log("→ Cargando cumplimiento por asesor...");
    const cumplimientoAsesoresRaw = parser.getCumplimientoAsesoresNuevo();
    await dbAdmin.delete(cumplimientoAsesores);
    result.rowsAffected["cumplimiento_asesores"] = await insertChunked(
      cumplimientoAsesores,
      cumplimientoAsesoresRaw.map((c) => ({
        anio: c.anio,
        mes: c.mes,
        codigoAsesor: c.codigoAsesor,
        asesor: c.asesor,
        asesorId: asesorIdPorNombre.get(c.asesor.trim().toLowerCase()) ?? null,
        sucursalId: sucursalesMap.get(c.sucursal.trim().toLowerCase()) ?? null,
        unidadNegocioId: c.unidadNegocio
          ? (unidadesMap.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
          : null,
        presupuesto: String(c.presupuesto),
        venta: String(c.venta),
        pctCumplimiento: String(c.pctCumplimiento),
        pctParticipacion: String(c.pctParticipacion),
      })),
    );

    result.success = true;
    console.log("✅ Carga completada exitosamente");
    console.log("📊 Filas cargadas:", result.rowsAffected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    console.error("❌ Error en carga:", message);
  }

  return result;
}

const CHUNK = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertChunked(table: any, rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await dbAdmin.insert(table).values(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

// Ejecución directa: `bun src/db/load-excel.ts <ruta-al-excel>`
if (process.argv[1]?.endsWith("load-excel.ts")) {
  const excelPath = process.argv[2] ?? path.join(process.cwd(), "CCV Rendimiento.xlsx");
  loadExcelToPostgres(excelPath)
    .then((result) => {
      console.log("\n📋 Resultado final:", result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
