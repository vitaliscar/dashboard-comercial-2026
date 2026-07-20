/**
 * Excel Data Load Service for Supabase
 * Runs weekly (Friday 5 AM Caracas time)
 * DELETE + INSERT pattern for full reload (profiles/auth users are upserted, not deleted)
 *
 * Carga contra el esquema REAL (supabase/migrations/*.sql): profiles, user_roles,
 * sucursales, unidades_negocio, cotizaciones, facturas, presupuestos, ventas_perdidas,
 * cobranzas, servicios, equipos_*, cumplimiento_asesores. Las tablas legacy (usuarios,
 * oportunidades, cumplimiento_base, facturacion, servicios viejo, lubricantes_filtros)
 * ya no se usan.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import path from "path";
import {
  ExcelParser,
  mapRolToAppRole,
  SUCURSALES_CANONICAS,
  UNIDADES_CANONICAS,
  UNIDAD_EQUIPOS,
  UNIDAD_ALQUILER,
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
// SUPABASE_SERVICE_KEY es el nombre viejo (docs/SUPABASE_SETUP.md desactualizado); se acepta
// como fallback para no requerir renombrar el secret en .env.local de inmediato.
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CHUNK = 500;

async function insertChunked(table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK) as never);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
}

// Cada usuario nuevo recibe una contraseña aleatoria de un solo uso; nunca queda
// hardcodeada en el código ni es adivinable. El usuario debe resetearla vía el
// flujo de "olvidé mi contraseña" de Supabase Auth en su primer login.
function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

function byNormalizedName<T extends { nombre: string; id: string }>(
  rows: T[],
): Map<string, string> {
  const map = new Map<string, string>();
  rows.forEach((r) => map.set(r.nombre.trim().toLowerCase(), r.id));
  return map;
}

/**
 * Sucursales y unidades_negocio: upsert por nombre (idempotente) y devuelve
 * mapas nombre(minúscula) -> id para resolver las FK del resto de la carga.
 */
async function seedCatalogos(): Promise<{
  sucursales: Map<string, string>;
  unidades: Map<string, string>;
}> {
  await supabase.from("sucursales").upsert(
    SUCURSALES_CANONICAS.map((nombre) => ({ nombre })),
    { onConflict: "nombre", ignoreDuplicates: true },
  );
  await supabase.from("unidades_negocio").upsert(
    UNIDADES_CANONICAS.map((nombre) => ({ nombre })),
    { onConflict: "nombre", ignoreDuplicates: true },
  );
  // Eliminar la fila legacy combinada "Equipos/Alquiler" ahora que existen
  // entradas separadas "Equipos" y "Alquiler".
  await supabase.from("unidades_negocio").delete().eq("nombre", "Equipos/Alquiler");

  const [{ data: sucursales }, { data: unidades }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre"),
    supabase.from("unidades_negocio").select("id, nombre"),
  ]);

  return {
    sucursales: byNormalizedName(sucursales ?? []),
    unidades: byNormalizedName(unidades ?? []),
  };
}

/**
 * Crea (o reutiliza) un usuario de Supabase Auth real por cada fila de la
 * hoja Usuarios, y sincroniza profiles/user_roles. Devuelve mapas para
 * resolver asesor_id en cotizaciones/facturas/ventas_perdidas por nombre.
 */
async function seedUsuarios(
  parser: ExcelParser,
  sucursales: Map<string, string>,
  unidades: Map<string, string>,
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

    let userId: string | null = null;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.contraseña || generateTemporaryPassword(),
      email_confirm: true,
      user_metadata: { nombre_completo: u.nombre },
    });

    if (created?.user) {
      userId = created.user.id;
    } else if (createError) {
      // Usuario ya existe: buscar su id por email en profiles (poblado por el trigger handle_new_user)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", u.email)
        .maybeSingle();
      userId = existing?.id ?? null;
      if (!userId) {
        console.warn(
          `⚠️  Usuarios: no se pudo crear ni encontrar ${u.email} (${createError.message})`,
        );
        continue;
      }
    }
    if (!userId) continue;

    const sucursalId = sucursales.get(u.sucursal.trim().toLowerCase()) ?? null;
    const { role, unidadNegocio } = mapRolToAppRole(u.rol);
    const unidadNombre = unidadNegocio ?? u.unidadesNegocio?.[0] ?? null;
    const unidadId = unidadNombre
      ? (unidades.get(unidadNombre.trim().toLowerCase()) ?? null)
      : null;

    await supabase
      .from("profiles")
      .update({ nombre_completo: u.nombre, sucursal_id: sucursalId, unidad_negocio_id: unidadId })
      .eq("id", userId);

    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role });

    userProfiles.push({ id: userId, nombre_completo: u.nombre });
    asesorIdPorNombre.set(u.nombre.trim().toLowerCase(), userId);
    count++;
  }

  return { asesorIdPorNombre, count, userProfiles };
}

function resolveFKs(
  row: { sucursal: string; unidadNegocio: string | null; asesor: string },
  sucursales: Map<string, string>,
  unidades: Map<string, string>,
  asesorIdPorNombre: Map<string, string>,
) {
  return {
    sucursal_id: sucursales.get(row.sucursal.trim().toLowerCase()) ?? null,
    unidad_negocio_id: row.unidadNegocio
      ? (unidades.get(row.unidadNegocio.trim().toLowerCase()) ?? null)
      : null,
    asesor_id: asesorIdPorNombre.get(row.asesor.trim().toLowerCase()) ?? null,
  };
}

/**
 * Load all Excel data into Supabase (esquema real)
 */
export async function loadExcelToSupabase(excelPath: string): Promise<LoadResult> {
  const result: LoadResult = {
    success: false,
    timestamp: new Date().toISOString(),
    rowsAffected: {},
    errors: [],
  };

  try {
    console.log("📊 Iniciando carga de Excel a Supabase (esquema real)...");
    const parser = new ExcelParser(excelPath);
    const now = new Date();

    // 1. Catálogos
    console.log("→ Sembrando sucursales y unidades de negocio...");
    const { sucursales, unidades } = await seedCatalogos();

    // 2. Usuarios (auth + profiles + user_roles)
    console.log("→ Cargando usuarios (Supabase Auth)...");
    const {
      asesorIdPorNombre,
      count: usuariosCount,
      userProfiles,
    } = await seedUsuarios(parser, sucursales, unidades);
    result.rowsAffected["usuarios"] = usuariosCount;

    // Build a fuzzy matching map for advisor names in transactions
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

    const normalizeName = (s: string): string => {
      return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

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

      if (bestMatch) {
        asesorIdPorNombre.set(rawAsesor.trim().toLowerCase(), bestMatch.id);
      }
    }

    // 3. Cotizaciones (Oportunidades + Oportunidades LubFiltros)
    console.log("→ Cargando cotizaciones...");
    const cotizaciones: Cotizacion[] = [
      ...parser.getCotizacionesPrincipales(),
      ...parser.getCotizacionesLubFiltros(),
    ];
    await supabase.from("cotizaciones").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["cotizaciones"] = await insertChunked(
      "cotizaciones",
      cotizaciones
        .filter((c) => c.unidadNegocio !== null) // unidad_negocio_id NOT NULL
        .map((c) => ({
          fecha: c.fecha ?? now.toISOString().slice(0, 10),
          cliente: c.cliente,
          asesor_codigo: c.asesorCodigo ?? null,
          nro_cotizacion: c.nroCotizacion ?? null,
          descripcion: c.descripcion ?? null,
          monto: c.monto,
          monto_facturado: c.montoFacturado ?? 0,
          monto_perdido: c.montoPerdido ?? 0,
          etapa: c.etapa,
          ...resolveFKs(c, sucursales, unidades, asesorIdPorNombre),
        })),
    );

    // 4. Facturas (Facturacion + LubricantesFiltros)
    console.log("→ Cargando facturas...");
    const facturas: FacturaNueva[] = [
      ...parser.getFacturasPrincipales(),
      ...parser.getFacturasLubFiltros(),
    ];
    await supabase.from("facturas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["facturas"] = await insertChunked(
      "facturas",
      facturas.map((f) => ({
        fecha: f.fecha ?? now.toISOString().slice(0, 10),
        numero: f.numero || null,
        cliente: f.cliente,
        asesor: f.asesor || null,
        monto: f.monto,
        ...resolveFKs(f, sucursales, unidades, asesorIdPorNombre),
      })),
    );

    // 5. Ventas perdidas (Ventas Perdidas: Repuestos + Lub/Filtros) + Oportunidades
    // (Servicios, Equipos, Alquiler con Etapa = Cerrado Perdido / Cerrado sin negocio).
    // Servicios puede venir de ambas hojas (fila "S-Servicio" en Ventas Perdidas y
    // filas de Oportunidades) — se insertan como filas separadas y se suman en las
    // consultas del dashboard, no aquí.
    console.log("→ Cargando ventas perdidas...");
    const ventasPerdidas: VentaPerdidaNueva[] = [
      ...parser.getVentasPerdidasNuevo(),
      ...parser.getOportunidadesVentasPerdidasNuevo(),
    ];
    await supabase
      .from("ventas_perdidas")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["ventas_perdidas"] = await insertChunked(
      "ventas_perdidas",
      ventasPerdidas.map((v) => ({
        fecha: v.fecha ?? now.toISOString().slice(0, 10),
        cliente: v.cliente,
        asesor: v.asesor || null,
        monto: v.monto,
        razon: v.razon,
        ...resolveFKs(v, sucursales, unidades, asesorIdPorNombre),
      })),
    );

    // 6. Presupuestos (CumplimientoBase), deduplicados por (anio, mes, sucursal, unidad)
    console.log("→ Cargando presupuestos...");
    const presupuestosRaw = parser.getPresupuestosNuevo();
    const presupuestosPorClave = new Map<
      string,
      {
        anio: number;
        mes: number;
        sucursal_id: string | null;
        unidad_negocio_id: string | null;
        monto: number;
        ventas_ccv: number;
        ventas_xibi: number;
        ventas_estrategicas: number;
      }
    >();
    presupuestosRaw.forEach((p) => {
      const sucursal_id = sucursales.get(p.sucursal.trim().toLowerCase()) ?? null;
      const unidad_negocio_id = p.unidadNegocio
        ? (unidades.get(p.unidadNegocio.trim().toLowerCase()) ?? null)
        : null;
      const key = `${p.anio}|${p.mes}|${sucursal_id}|${unidad_negocio_id}`;
      const existing = presupuestosPorClave.get(key);
      if (existing) {
        existing.monto += p.monto;
        existing.ventas_ccv += p.ventasCCV;
        existing.ventas_xibi += p.ventasXibi;
        existing.ventas_estrategicas += p.ventasEstrategicas;
      } else
        presupuestosPorClave.set(key, {
          anio: p.anio,
          mes: p.mes,
          sucursal_id,
          unidad_negocio_id,
          monto: p.monto,
          ventas_ccv: p.ventasCCV,
          ventas_xibi: p.ventasXibi,
          ventas_estrategicas: p.ventasEstrategicas,
        });
    });
    await supabase.from("presupuestos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["presupuestos"] = await insertChunked(
      "presupuestos",
      Array.from(presupuestosPorClave.values()),
    );

    // 7. Cobranzas (Cuentas por Cobrar) + split a cobranzas_equipos
    console.log("→ Cargando cobranzas...");
    const cobranzas = parser.getCobranzasNuevo();

    // Snapshot semanal histórico (append-only): no reemplaza nada, sólo conserva
    // el estado de cartera al momento de cada corrida.
    const snapshotDate = now.toISOString().slice(0, 10);
    const snapshotRows = cobranzas.map((c) => ({
      snapshot_date: snapshotDate,
      cliente: c.cliente,
      factura_numero: c.facturaNumero || null,
      fecha_emision: c.fechaEmision ?? now.toISOString().slice(0, 10),
      fecha_vencimiento: c.fechaVencimiento ?? now.toISOString().slice(0, 10),
      monto: c.monto,
      saldo: c.saldo,
      sucursal_id: sucursales.get(c.sucursal.trim().toLowerCase()) ?? null,
      unidad_negocio_id: c.unidadNegocio
        ? (unidades.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
        : null,
    }));
    for (let i = 0; i < snapshotRows.length; i += CHUNK) {
      const { error } = await (
        supabase as unknown as {
          from: (table: string) => {
            insert: (
              rows: Record<string, unknown>[],
            ) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("cobranzas_snapshots")
        .insert(snapshotRows.slice(i, i + CHUNK));
      if (error) throw new Error(`cobranzas_snapshots: ${error.message}`);
    }
    result.rowsAffected["cobranzas_snapshots"] = snapshotRows.length;

    await supabase.from("cobranzas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["cobranzas"] = await insertChunked(
      "cobranzas",
      cobranzas.map((c) => ({
        cliente: c.cliente,
        factura_numero: c.facturaNumero || null,
        fecha_emision: c.fechaEmision ?? now.toISOString().slice(0, 10),
        fecha_vencimiento: c.fechaVencimiento ?? now.toISOString().slice(0, 10),
        monto: c.monto,
        saldo: c.saldo,
        sucursal_id: sucursales.get(c.sucursal.trim().toLowerCase()) ?? null,
        unidad_negocio_id: c.unidadNegocio
          ? (unidades.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
          : null,
      })),
    );
    await supabase
      .from("cobranzas_equipos")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["cobranzas_equipos"] = await insertChunked(
      "cobranzas_equipos",
      cobranzas
        .filter((c) => c.unidadNegocio === UNIDAD_EQUIPOS || c.unidadNegocio === UNIDAD_ALQUILER)
        .map((c) => ({
          cliente: c.cliente,
          monto: c.monto,
          saldo: c.saldo,
          sucursal_id: sucursales.get(c.sucursal.trim().toLowerCase()) ?? null,
        })),
    );

    // 8. Servicios
    console.log("→ Cargando servicios...");
    const servicios = parser.getServiciosNuevo();
    await supabase.from("servicios").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["servicios"] = await insertChunked(
      "servicios",
      servicios.map((s) => ({
        fecha: s.fecha ?? now.toISOString().slice(0, 10),
        cliente: s.cliente,
        monto: s.monto,
        tipo_servicio: s.tipoServicio || null,
        categoria_venta: s.categoriaVenta || null,
        compania: s.compania || null,
        asesor: s.asesor || null,
        sucursal_id: sucursales.get(s.sucursal.trim().toLowerCase()) ?? null,
        unidad_negocio_id: unidades.get(s.unidadNegocio!.trim().toLowerCase()) ?? null,
      })),
    );

    // 9. Equipos: inventario (mes/año actual, snapshot semanal)
    console.log("→ Cargando inventario de equipos...");
    const equiposInventario = parser.getEquiposInventario();
    const unidadEquiposId = unidades.get(UNIDAD_EQUIPOS.toLowerCase()) ?? null;
    await supabase
      .from("equipos_inventario")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["equipos_inventario"] = await insertChunked(
      "equipos_inventario",
      equiposInventario.map((e) => ({
        anio: now.getFullYear(),
        mes: now.getMonth() + 1,
        marca: e.marca,
        disponible: e.disponible,
        transito: e.transito,
        unidad_negocio_id: unidadEquiposId,
      })),
    );

    // 10. Equipos: ventas por marca / por sucursal / mensual, agregado desde Detalles de Ventas Equipos
    console.log("→ Cargando ventas de equipos...");
    const equiposDetalle = parser.getEquiposDetalleVentas();

    await supabase
      .from("equipos_por_marca")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["equipos_por_marca"] = await insertChunked(
      "equipos_por_marca",
      equiposDetalle.map((e) => ({
        anio: e.anio,
        mes: e.mes,
        marca: e.marca,
        monto: e.monto,
        sucursal_id: sucursales.get(e.sucursal.trim().toLowerCase()) ?? null,
        unidad_negocio_id: unidadEquiposId,
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

    await supabase
      .from("equipos_facturacion_sucursal")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["equipos_facturacion_sucursal"] = await insertChunked(
      "equipos_facturacion_sucursal",
      Array.from(porSucursalMes.values()).map((r) => ({
        anio: r.anio,
        mes: r.mes,
        sucursal: r.sucursal,
        facturado: r.facturado,
        unidad_negocio_id: unidadEquiposId,
      })),
    );

    // 11. Equipos: presupuesto anual (de CumplimientoBase filtrado a Equipos/Alquiler)
    const presupuestoEquiposPorAnio = new Map<number, number>();
    presupuestosRaw
      .filter((p) => p.unidadNegocio === UNIDAD_EQUIPOS || p.unidadNegocio === UNIDAD_ALQUILER)
      .forEach((p) =>
        presupuestoEquiposPorAnio.set(
          p.anio,
          (presupuestoEquiposPorAnio.get(p.anio) ?? 0) + p.monto,
        ),
      );

    await supabase
      .from("equipos_presupuesto")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["equipos_presupuesto"] = await insertChunked(
      "equipos_presupuesto",
      Array.from(presupuestoEquiposPorAnio.entries()).map(([anio, monto]) => ({
        anio,
        monto,
        unidad_negocio_id: unidadEquiposId,
      })),
    );

    // equipos_facturacion (facturado por mes vs presupuesto — presupuesto queda en 0,
    // CumplimientoBase solo trae el monto anual/mensual agregado por sucursal, no por unidad+mes limpio)
    await supabase
      .from("equipos_facturacion")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["equipos_facturacion"] = await insertChunked(
      "equipos_facturacion",
      Array.from(porMes.values()).map((r) => ({
        anio: r.anio,
        mes: r.mes,
        facturado: r.facturado,
        presupuesto: 0,
        unidad_negocio_id: unidadEquiposId,
      })),
    );

    // 12. Cumplimiento por asesor (CumplimientoAsesoresBase)
    console.log("→ Cargando cumplimiento por asesor...");
    const cumplimientoAsesores = parser.getCumplimientoAsesoresNuevo();
    await supabase
      .from("cumplimiento_asesores")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    result.rowsAffected["cumplimiento_asesores"] = await insertChunked(
      "cumplimiento_asesores",
      cumplimientoAsesores.map((c) => ({
        anio: c.anio,
        mes: c.mes,
        codigo_asesor: c.codigoAsesor,
        asesor: c.asesor,
        asesor_id: asesorIdPorNombre.get(c.asesor.trim().toLowerCase()) ?? null,
        sucursal_id: sucursales.get(c.sucursal.trim().toLowerCase()) ?? null,
        unidad_negocio_id: c.unidadNegocio
          ? (unidades.get(c.unidadNegocio.trim().toLowerCase()) ?? null)
          : null,
        presupuesto: c.presupuesto,
        venta: c.venta,
        pct_cumplimiento: c.pctCumplimiento,
        pct_participacion: c.pctParticipacion,
      })),
    );

    // 13. Refrescar las Materialized Views agregadas (mv_resumen_mensual,
    // mv_cotizado_mensual, mv_perdidas_mensual) ahora que presupuestos,
    // cotizaciones y ventas_perdidas tienen datos frescos.
    console.log("→ Refrescando materialized views...");
    const { error: refreshError } = await supabase.rpc("refresh_todas_mv");
    if (refreshError) throw new Error(`refresh_todas_mv: ${refreshError.message}`);

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

// Main execution (if run directly)
if (process.argv[1]?.endsWith("load-excel.ts")) {
  const excelPath = path.join(process.cwd(), "CCV Rendimiento.xlsx");
  loadExcelToSupabase(excelPath)
    .then((result) => {
      console.log("\n📋 Resultado final:", result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
