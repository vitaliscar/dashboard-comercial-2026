import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────
// Valores reales de producción (ver docs/SCHEMA.md "Drift conocido") — NO los
// de supabase/migrations/*.sql, que están desincronizados.
export const appRole = pgEnum("app_role", [
  "gerencia",
  "gerente_comercial",
  "coordinador",
  "asesor",
]);

export const cotizacionEtapa = pgEnum("cotizacion_etapa", [
  "desarrollo",
  "propuesta_negociacion",
  "venta_perdida",
  "desconocido",
]);

export const minutaEstado = pgEnum("minuta_estado", ["pendiente", "en_proceso", "cumplido"]);

// ── Auth propio (reemplaza auth.users / Supabase Auth) ─────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Catálogos / identidad ───────────────────────────────────────────────────
export const sucursales = pgTable("sucursales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  ciudad: text("ciudad"),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unidadesNegocio = pgTable("unidades_negocio", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  descripcion: text("descripcion"),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// profiles.id apunta a users.id (antes: auth.users.id de Supabase)
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  nombreCompleto: text("nombre_completo"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Multi-unidad para gerente_comercial (alcance en más de una unidad de negocio)
export const profileUnidadesNegocio = pgTable(
  "profile_unidades_negocio",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    unidadNegocioId: uuid("unidad_negocio_id")
      .notNull()
      .references(() => unidadesNegocio.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.unidadNegocioId] })],
);

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: appRole("role").notNull(),
});

// ── Comerciales / transaccionales ───────────────────────────────────────────
// cotizaciones: sin columna `asesor` (drift conocido) — resolver el nombre
// contra cumplimiento_asesores.codigo_asesor en el código de consulta, no aquí.
export const cotizaciones = pgTable("cotizaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull(),
  cliente: text("cliente").notNull(),
  asesorCodigo: text("asesor_codigo"),
  asesorId: uuid("asesor_id"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  // NOT NULL aquí, a diferencia de facturas/ventas_perdidas
  unidadNegocioId: uuid("unidad_negocio_id")
    .notNull()
    .references(() => unidadesNegocio.id),
  nroCotizacion: text("nro_cotizacion"),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  montoFacturado: numeric("monto_facturado", { precision: 14, scale: 2 }).notNull().default("0"),
  montoPerdido: numeric("monto_perdido", { precision: 14, scale: 2 }).notNull().default("0"),
  etapa: cotizacionEtapa("etapa").notNull().default("desarrollo"),
  descripcion: text("descripcion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const facturas = pgTable("facturas", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull(),
  numero: text("numero"),
  cliente: text("cliente").notNull(),
  asesor: text("asesor"),
  asesorId: uuid("asesor_id"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ventasPerdidas = pgTable("ventas_perdidas", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull(),
  cliente: text("cliente").notNull(),
  asesor: text("asesor"),
  asesorId: uuid("asesor_id"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  razon: text("razon").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const servicios = pgTable("servicios", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull(),
  cliente: text("cliente").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  tipoServicio: text("tipo_servicio"),
  categoriaVenta: text("categoria_venta"),
  compania: text("compania"),
  asesor: text("asesor"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Estado actual únicamente — sin histórico (ver cobranzas_snapshots, diferida)
export const cobranzas = pgTable("cobranzas", {
  id: uuid("id").primaryKey().defaultRandom(),
  cliente: text("cliente").notNull(),
  facturaNumero: text("factura_numero"),
  fechaEmision: date("fecha_emision").notNull(),
  fechaVencimiento: date("fecha_vencimiento").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  saldo: numeric("saldo", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cartera de Equipos/Alquiler — sin unidad_negocio_id
export const cobranzasEquipos = pgTable("cobranzas_equipos", {
  id: uuid("id").primaryKey().defaultRandom(),
  cliente: text("cliente").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  saldo: numeric("saldo", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const minutas = pgTable("minutas", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull().defaultNow(),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  cliente: text("cliente").notNull(),
  descripcion: text("descripcion").notNull(),
  responsable: text("responsable").notNull(),
  responsableId: uuid("responsable_id"),
  fechaLimite: date("fecha_limite"),
  estado: minutaEstado("estado").notNull().default("pendiente"),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Presupuesto / cumplimiento ──────────────────────────────────────────────
// Fuente de verdad del KPI "Facturado" (no `facturas`, que es transaccional y
// no reconciliada). Sin columna `cliente` ni `asesor` — es agregado mensual.
export const presupuestos = pgTable("presupuestos", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  ventasCcv: numeric("ventas_ccv", { precision: 14, scale: 2 }).notNull().default("0"),
  ventasXibi: numeric("ventas_xibi", { precision: 14, scale: 2 }).notNull().default("0"),
  ventasEstrategicas: numeric("ventas_estrategicas", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
});

// Única tabla con el nombre completo del asesor junto a su código.
export const cumplimientoAsesores = pgTable("cumplimiento_asesores", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  codigoAsesor: text("codigo_asesor").notNull(),
  asesor: text("asesor").notNull(),
  asesorId: uuid("asesor_id"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  presupuesto: numeric("presupuesto", { precision: 14, scale: 2 }).notNull().default("0"),
  venta: numeric("venta", { precision: 14, scale: 2 }).notNull().default("0"),
  pctCumplimiento: numeric("pct_cumplimiento", { precision: 7, scale: 4 }).notNull().default("0"),
  pctParticipacion: numeric("pct_participacion", { precision: 7, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comisionesReglas = pgTable("comisiones_reglas", {
  id: uuid("id").primaryKey().defaultRandom(),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  umbralMinPct: numeric("umbral_min_pct", { precision: 7, scale: 4 }).notNull(),
  umbralMaxPct: numeric("umbral_max_pct", { precision: 7, scale: 4 }),
  tasaComision: numeric("tasa_comision", { precision: 7, scale: 4 }).notNull(),
  activa: boolean("activa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Equipos (dashboard Equipos) ─────────────────────────────────────────────
export const equiposInventario = pgTable("equipos_inventario", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  marca: text("marca").notNull(),
  disponible: numeric("disponible", { precision: 14, scale: 2 }).notNull().default("0"),
  transito: numeric("transito", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equiposFacturacion = pgTable("equipos_facturacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  facturado: numeric("facturado", { precision: 14, scale: 2 }).notNull().default("0"),
  presupuesto: numeric("presupuesto", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equiposPresupuesto = pgTable("equipos_presupuesto", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// `sucursal` es texto libre, NO FK (drift conocido — no normalizado).
export const equiposFacturacionSucursal = pgTable("equipos_facturacion_sucursal", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  sucursal: text("sucursal").notNull(),
  facturado: numeric("facturado", { precision: 14, scale: 2 }).notNull().default("0"),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equiposPorMarca = pgTable("equipos_por_marca", {
  id: uuid("id").primaryKey().defaultRandom(),
  anio: integer("anio").notNull(),
  mes: integer("mes").notNull(),
  marca: text("marca").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  sucursalId: uuid("sucursal_id").references(() => sucursales.id),
  unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
