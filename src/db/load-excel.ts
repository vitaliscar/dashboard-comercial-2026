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
  profileUnidadesNegocio,
  userRoles,
  sessions,
  sucursales,
  unidadesNegocio,
  cotizaciones,
  facturas,
  ventasPerdidas,
  presupuestos,
  cobranzas,
  cobranzasSnapshots,
  cobranzasEquipos,
  servicios,
  detallesServiciosEstrategicos,
  serviciosInterno,
  equiposInventario,
  equiposPorMarca,
  equiposFacturacionSucursal,
  equiposPresupuesto,
  equiposFacturacion,
  cumplimientoAsesores,
  ventasCasa,
  detallesVentasLubfiltros,
  inventarioLubfiltros,
  detallesVentasRepuestos,
  mercadeoCanales,
  mercadeoInstagram,
  mercadeoGoogleBusiness,
  mercadeoPostHistorias,
  clientesPotenciales,
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

/** Cliente de transacción de dbAdmin — todo el pipeline de carga corre atómico. */
export type DbAdminTx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

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
export async function seedCatalogos(tx: DbAdminTx): Promise<{
  sucursales: Map<string, string>;
  unidades: Map<string, string>;
}> {
  await tx
    .insert(sucursales)
    .values(SUCURSALES_CANONICAS.map((nombre) => ({ nombre })))
    .onConflictDoNothing({ target: sucursales.nombre });

  // San Cristóbal solo aparece en las hojas de Mercadeo. visible_general=false
  // la saca de getSucursalesAction(), que alimenta los FilterHeader del resto
  // del sistema. Idempotente: se re-aplica en cada carga.
  await tx
    .update(sucursales)
    .set({ visibleGeneral: false })
    .where(eq(sucursales.nombre, "San Cristóbal"));

  await tx
    .insert(unidadesNegocio)
    .values(UNIDADES_CANONICAS.map((nombre) => ({ nombre })))
    .onConflictDoNothing({ target: unidadesNegocio.nombre });

  // Eliminar la fila legacy combinada "Equipos/Alquiler" ahora que existen
  // entradas separadas "Equipos" y "Alquiler".
  await tx.delete(unidadesNegocio).where(eq(unidadesNegocio.nombre, UNIDAD_EQUIPOS_ALQUILER));

  const [sucursalesRows, unidadesRows] = await Promise.all([
    tx.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales),
    tx.select({ id: unidadesNegocio.id, nombre: unidadesNegocio.nombre }).from(unidadesNegocio),
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
  tx: DbAdminTx,
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

  // Single query for existing users
  const existingUsers = await tx.select({ id: users.id, email: users.email }).from(users);
  const existingMap = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));

  // Solo sincronizar passwords/roles/isActive si EXCEL_SYNC_IDENTITY=1 (explícito).
  // Por defecto la carga rutinaria no reescribe identidad (CN-028).
  const syncIdentity = process.env.EXCEL_SYNC_IDENTITY === "1";

  // Cache argon2 password hashes so identical passwords (e.g. "inicio2026") are hashed only once
  const passHashCache = new Map<string, string>();
  const getPasswordHash = async (rawPass: string): Promise<string> => {
    let cached = passHashCache.get(rawPass);
    if (!cached) {
      cached = await argon2Hash(rawPass);
      passHashCache.set(rawPass, cached);
    }
    return cached;
  };

  for (const u of usuarios) {
    if (!u.email) continue;
    const cleanEmail = u.email.trim().toLowerCase();
    const rawPass = u.contraseña?.trim();

    let userId = existingMap.get(cleanEmail);
    const isNew = !userId;

    if (userId) {
      // Usuario existente: nunca resetear password/isActive en carga rutinaria.
      if (syncIdentity && rawPass) {
        const passwordHash = await getPasswordHash(rawPass);
        await tx.update(users).set({ passwordHash, isActive: true }).where(eq(users.id, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      }
    } else {
      const pass = rawPass || generateTemporaryPassword();
      const passwordHash = await getPasswordHash(pass);
      const [created] = await tx
        .insert(users)
        .values({ email: cleanEmail, passwordHash, isActive: true })
        .returning({ id: users.id });
      userId = created.id;
      existingMap.set(cleanEmail, userId);
      await tx.insert(profiles).values({ id: userId, email: cleanEmail });
    }

    const sucursalId = sucursalesMap.get(u.sucursal.trim().toLowerCase()) ?? null;
    const { role, unidadNegocio } = mapRolToAppRole(u.rol);
    const unidadNombre = unidadNegocio ?? u.unidadesNegocio?.[0] ?? null;
    const unidadId = unidadNombre
      ? (unidadesMap.get(unidadNombre.trim().toLowerCase()) ?? null)
      : null;

    await tx
      .update(profiles)
      .set({ nombreCompleto: u.nombre, sucursalId, unidadNegocioId: unidadId })
      .where(eq(profiles.id, userId));

    // Roles: solo al crear usuario nuevo, o con EXCEL_SYNC_IDENTITY=1.
    if (isNew || syncIdentity) {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values({ userId, role });
    }

    // Multi-unidad para gerente_comercial — RLS (can_read_row en
    // 0001_rls_policies.sql) consulta ESTA tabla, no profiles.unidad_negocio_id
    // (que solo guarda la primera unidad, para compatibilidad legacy). Sin esto,
    // un gerente_comercial no ve NINGÚN dato scoped por unidad (presupuestos,
    // equipos_por_marca, equipos_inventario, etc.) — la condición RLS siempre
    // evalúa a false.
    await tx.delete(profileUnidadesNegocio).where(eq(profileUnidadesNegocio.profileId, userId));
    const unidadesAsignadasIds = Array.from(
      new Set(
        (u.unidadesNegocio ?? [])
          .map((nombre) => unidadesMap.get(nombre.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (unidadesAsignadasIds.length > 0) {
      await tx
        .insert(profileUnidadesNegocio)
        .values(
          unidadesAsignadasIds.map((unidadNegocioId) => ({ profileId: userId, unidadNegocioId })),
        );
    }

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

/**
 * Carga completa del Excel a Postgres local (esquema Drizzle, Fase 2).
 * `excelSource` puede ser un path/Buffer (CLI, cron — se parsea aquí mismo,
 * el proceso es de un solo uso) o un ExcelParser ya construido (Server
 * Action de upload manual — ver src/lib/actions/carga.ts, que lo parsea en
 * un worker thread aparte para no bloquear el proceso que sirve requests).
 */
export async function loadExcelToPostgres(
  excelSource: string | Buffer | ExcelParser,
): Promise<LoadResult> {
  const result: LoadResult = {
    success: false,
    timestamp: new Date().toISOString(),
    rowsAffected: {},
    errors: [],
  };

  try {
    await dbAdmin.transaction(async (tx) => {
      console.log("📊 Iniciando carga de Excel a Postgres local...");
      const parser = excelSource instanceof ExcelParser ? excelSource : new ExcelParser(excelSource);
      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      console.log("→ Sembrando sucursales y unidades de negocio...");
      const { sucursales: sucursalesMap, unidades: unidadesMap } = await seedCatalogos(tx);

      console.log("→ Cargando usuarios...");
      const {
        asesorIdPorNombre,
        count: usuariosCount,
        userProfiles,
      } = await seedUsuarios(tx, parser, sucursalesMap, unidadesMap);
      result.rowsAffected["usuarios"] = usuariosCount;

      // Fuzzy-match de nombres de asesor pre-normalizando los nombres de perfil
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

      const profileWordsList = userProfiles.map((p) => {
        const norm = normalizeName(p.nombre_completo);
        return {
          profile: p,
          words: norm.split(" ").filter((w) => w.length > 2),
        };
      });

      for (const rawAsesor of uniqueAsesores) {
        const normAsesor = normalizeName(rawAsesor);
        const asesorWords = normAsesor.split(" ").filter((w) => w.length > 2);
        let bestMatch: { id: string; nombre_completo: string } | null = null;
        let maxMatchWords = 0;
        for (const item of profileWordsList) {
          const profileWords = item.words;
          const intersection = asesorWords.filter((w) => profileWords.includes(w));
          if (
            intersection.length >= 2 ||
            (intersection.length === 1 && profileWords.length === 1)
          ) {
            if (intersection.length > maxMatchWords) {
              maxMatchWords = intersection.length;
              bestMatch = item.profile;
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
      await tx.delete(cotizaciones);
      result.rowsAffected["cotizaciones"] = await insertChunked(
        tx,
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
      await tx.delete(facturas);
      result.rowsAffected["facturas"] = await insertChunked(
        tx,
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
      await tx.delete(ventasPerdidas);
      result.rowsAffected["ventas_perdidas"] = await insertChunked(
        tx,
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
      await tx.delete(presupuestos);
      result.rowsAffected["presupuestos"] = await insertChunked(
        tx,
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

      // 7. Cobranzas + snapshot acumulado + split a cobranzas_equipos
      console.log("→ Guardando snapshot de cobranzas previas...");
      const actualCobranzas = await tx.select().from(cobranzas);
      if (actualCobranzas.length > 0) {
        const snapshotTimestamp = new Date();
        result.rowsAffected["cobranzas_snapshots"] = await insertChunked(
          tx,
          cobranzasSnapshots,
          actualCobranzas.map((c) => ({
            cliente: c.cliente,
            facturaNumero: c.facturaNumero,
            fechaEmision: c.fechaEmision,
            fechaVencimiento: c.fechaVencimiento,
            monto: c.monto,
            saldo: c.saldo,
            diasVencidos: c.diasVencidos,
            sucursalId: c.sucursalId,
            unidadNegocioId: c.unidadNegocioId,
            capturedAt: snapshotTimestamp,
          })),
        );
      }

      console.log("→ Cargando cobranzas...");
      const cobranzasRaw = parser.getCobranzasNuevo();
      await tx.delete(cobranzas);
      result.rowsAffected["cobranzas"] = await insertChunked(
        tx,
        cobranzas,
        cobranzasRaw.map((c) => ({
          cliente: c.cliente,
          facturaNumero: c.facturaNumero || null,
          fechaEmision: c.fechaEmision ?? today,
          fechaVencimiento: c.fechaVencimiento ?? today,
          monto: String(c.monto),
          saldo: String(c.saldo),
          diasVencidos: c.diasVencidos ?? 0,
          sucursalId: sucursalesMap.get(c.sucursal.trim().toLowerCase()) ?? null,
          unidadNegocioId: c.unidadNegocio
            ? (unidadesMap.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
            : null,
        })),
      );
      await tx.delete(cobranzasEquipos);
      result.rowsAffected["cobranzas_equipos"] = await insertChunked(
        tx,
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
      await tx.delete(servicios);
      result.rowsAffected["servicios"] = await insertChunked(
        tx,
        servicios,
        serviciosRaw.map((s) => ({
          fecha: s.fecha ?? today,
          cliente: s.cliente,
          monto: String(s.monto),
          tipoServicio: s.tipoServicio || null,
          categoriaVenta: s.categoriaVenta || null,
          compania: s.compania || null,
          asesor: s.asesor || null,
          taller: s.taller || null,
          csa: s.csa || null,
          sucursalId: sucursalesMap.get(s.sucursal.trim().toLowerCase()) ?? null,
          unidadNegocioId: unidadesMap.get(s.unidadNegocio!.trim().toLowerCase()) ?? null,
        })),
      );

      // 8.1 Detalles Servicios Estratégicos
      console.log("→ Cargando detalles servicios estratégicos...");
      const detallesEstrategicosRaw = parser.getDetallesServiciosEstrategicos();
      await tx.delete(detallesServiciosEstrategicos);
      result.rowsAffected["detalles_servicios_estrategicos"] = await insertChunked(
        tx,
        detallesServiciosEstrategicos,
        detallesEstrategicosRaw.map((d) => ({
          sucursalId: sucursalesMap.get(d.sucursal.trim().toLowerCase()) ?? null,
          mes: d.mes,
          tipoServicio: d.tipoServicio,
          monto: String(d.monto),
        })),
      );

      // 8.2 Servicios Interno (solo Mes + Monto, sin sucursal/año)
      console.log("→ Cargando servicios interno...");
      const serviciosInternoRaw = parser.getServiciosInterno();
      await tx.delete(serviciosInterno);
      result.rowsAffected["servicios_interno"] = await insertChunked(
        tx,
        serviciosInterno,
        serviciosInternoRaw.map((s) => ({
          mes: s.mes,
          monto: String(s.monto),
        })),
      );

      // 8.3 Lub/Filtros: detalle de ventas por marca (Chronus, Donaldson, Donaldson Industrial)
      console.log("→ Cargando detalles de ventas Lub/Filtros...");
      const detallesVentasLubfiltrosRaw = parser.getDetallesVentasLubfiltros();
      await tx.delete(detallesVentasLubfiltros);
      result.rowsAffected["detalles_ventas_lubfiltros"] = await insertChunked(
        tx,
        detallesVentasLubfiltros,
        detallesVentasLubfiltrosRaw.map((d) => ({
          marca: d.marca,
          mes: d.mes,
          ventasCcv: String(d.ventasCcv),
          ventasXibi: String(d.ventasXibi),
          ventasEstrategicas: String(d.ventasEstrategicas),
          montoTotal: String(d.montoTotal),
        })),
      );

      // 8.4 Lub/Filtros: inventario (Lubricantes vs Filtros, por sucursal)
      console.log("→ Cargando inventario Lub/Filtros...");
      const inventarioLubfiltrosRaw = parser.getInventarioLubfiltros();
      await tx.delete(inventarioLubfiltros);
      result.rowsAffected["inventario_lubfiltros"] = await insertChunked(
        tx,
        inventarioLubfiltros,
        inventarioLubfiltrosRaw.map((i) => ({
          tipo: i.tipo,
          proveedorCodigo: i.proveedorCodigo,
          sucursal: i.sucursal,
          monto: String(i.monto),
        })),
      );

      // 8.5 Repuestos: detalle de ventas por marca (Caterpillar, Blumaq, Vms Corporation...)
      console.log("→ Cargando detalles de ventas Repuestos...");
      const detallesVentasRepuestosRaw = parser.getDetallesVentasRepuestos();
      await tx.delete(detallesVentasRepuestos);
      result.rowsAffected["detalles_ventas_repuestos"] = await insertChunked(
        tx,
        detallesVentasRepuestos,
        detallesVentasRepuestosRaw.map((d) => ({
          marca: d.marca,
          mes: d.mes,
          ventasCcv: String(d.ventasCcv),
          ventasXibi: String(d.ventasXibi),
          montoTotal: String(d.montoTotal),
        })),
      );

      // 9. Equipos: inventario (mes/año actual, snapshot semanal)
      console.log("→ Cargando inventario de equipos...");
      const equiposInventarioRaw = parser.getEquiposInventario();
      const unidadEquiposId = unidadesMap.get(UNIDAD_EQUIPOS.toLowerCase()) ?? null;
      await tx.delete(equiposInventario);
      result.rowsAffected["equipos_inventario"] = await insertChunked(
        tx,
        equiposInventario,
        equiposInventarioRaw.map((e) => ({
          anio: now.getFullYear(),
          mes: now.getMonth() + 1,
          marca: e.marca,
          tipoEquipo: e.tipoEquipo,
          disponible: String(e.disponible),
          transito: String(e.transito),
          stockDisponible: e.stockDisponible,
          stockTransito: e.stockTransito,
          unidadNegocioId: unidadEquiposId,
        })),
      );

      // 10. Equipos: ventas por marca / por sucursal / mensual
      console.log("→ Cargando ventas de equipos...");
      const equiposDetalle = parser.getEquiposDetalleVentas();

      await tx.delete(equiposPorMarca);
      result.rowsAffected["equipos_por_marca"] = await insertChunked(
        tx,
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

      await tx.delete(equiposFacturacionSucursal);
      result.rowsAffected["equipos_facturacion_sucursal"] = await insertChunked(
        tx,
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

      await tx.delete(equiposPresupuesto);
      result.rowsAffected["equipos_presupuesto"] = await insertChunked(
        tx,
        equiposPresupuesto,
        Array.from(presupuestoEquiposPorAnio.entries()).map(([anio, monto]) => ({
          anio,
          monto: String(monto),
          unidadNegocioId: unidadEquiposId,
        })),
      );

      await tx.delete(equiposFacturacion);
      result.rowsAffected["equipos_facturacion"] = await insertChunked(
        tx,
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
      await tx.delete(cumplimientoAsesores);
      result.rowsAffected["cumplimiento_asesores"] = await insertChunked(
        tx,
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

      // 13. Ventas Casa (Sucursal/U-N/Mes, sin asesor asociado)
      console.log("→ Cargando ventas casa...");
      const ventasCasaRaw = parser.getVentasCasa();
      await tx.delete(ventasCasa);
      result.rowsAffected["ventas_casa"] = await insertChunked(
        tx,
        ventasCasa,
        ventasCasaRaw.map((v) => ({
          sucursalId: sucursalesMap.get(v.sucursal.trim().toLowerCase()) ?? null,
          unidadNegocioId: v.unidadNegocio
            ? (unidadesMap.get(v.unidadNegocio.trim().toLowerCase()) ?? null)
            : null,
          mes: v.mes,
          monto: String(v.monto),
        })),
      );

      // 14. Mercadeo — hojas Canales / Instagram / Google My Business /
      // Post Historias / Clientes Potenciales.
      console.log("→ Cargando métricas de mercadeo...");

      await tx.delete(mercadeoCanales);
      result.rowsAffected["mercadeo_canales"] = await insertChunked(
        tx,
        mercadeoCanales,
        parser.getMercadeoCanales().map((r) => ({
          canal: r.canal,
          tipo: r.tipo,
          mes: r.mes,
          cantidad: String(r.cantidad),
        })),
      );

      await tx.delete(mercadeoInstagram);
      result.rowsAffected["mercadeo_instagram"] = await insertChunked(
        tx,
        mercadeoInstagram,
        parser.getMercadeoInstagram().map((r) => ({
          tipo: r.tipo,
          mes: r.mes,
          cantidad: String(r.cantidad),
        })),
      );

      await tx.delete(mercadeoGoogleBusiness);
      result.rowsAffected["mercadeo_google_business"] = await insertChunked(
        tx,
        mercadeoGoogleBusiness,
        parser.getMercadeoGoogleBusiness().map((r) => ({
          sucursalId: sucursalesMap.get(r.sucursal.trim().toLowerCase()) ?? null,
          mes: r.mes,
          tipo: r.tipo,
          cantidad: String(r.cantidad),
        })),
      );

      await tx.delete(mercadeoPostHistorias);
      result.rowsAffected["mercadeo_post_historias"] = await insertChunked(
        tx,
        mercadeoPostHistorias,
        parser.getMercadeoPostHistorias().map((r) => ({
          tipoPublicacion: r.tipoPublicacion,
          unidadNegocio: r.unidadNegocio,
          marca: r.marca,
          mes: r.mes,
          cantidad: r.cantidad,
        })),
      );

      console.log("→ Cargando clientes potenciales...");
      await tx.delete(clientesPotenciales);
      result.rowsAffected["clientes_potenciales"] = await insertChunked(
        tx,
        clientesPotenciales,
        parser.getClientesPotenciales().map((l) => ({
          idClientePotencial: l.idClientePotencial,
          // Machine Shop no es sucursal canónica → queda null, la fila se carga igual.
          sucursalId: sucursalesMap.get(l.sucursal.trim().toLowerCase()) ?? null,
          tipoNegocio: l.tipoNegocio,
          razonSocial: l.razonSocial,
          nombreContacto: l.nombreContacto,
          correo: l.correo,
          telefono: l.telefono,
          identificacionFiscal: l.identificacionFiscal,
          fechaDetectada: l.fechaDetectada,
          estatusBis: l.estatusBis,
          etapaOportunidad: l.etapaOportunidad,
          tomaContacto: l.tomaContacto,
          campana: l.campana,
          usuarioAsignado: l.usuarioAsignado,
          ingresosEsperados: String(l.ingresosEsperados),
          montoFacturadoBase: String(l.montoFacturadoBase),
        })),
      );

      result.success = true;
      console.log("✅ Carga completada exitosamente");
      console.log("📊 Filas cargadas:", result.rowsAffected);

      const unidadesNoReconocidas = parser.getUnidadesNegocioNoReconocidas();
      if (unidadesNoReconocidas.length > 0) {
        console.warn(
          "⚠️  Valores de 'Unidad de Negocio' no reconocidos (filas sin unidad asignada — revisar UNIDAD_NEGOCIO_KEYWORDS en src/lib/excel-parser.ts):",
        );
        unidadesNoReconocidas.forEach(({ texto, filas }) =>
          console.warn(`   - "${texto}" (${filas} fila${filas === 1 ? "" : "s"})`),
        );
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    console.error("❌ Error en carga:", message);
  }

  return result;
}

const CHUNK = 2500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertChunked(
  tx: DbAdminTx,
  table: any,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK));
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
