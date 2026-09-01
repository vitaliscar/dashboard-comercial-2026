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
  index,
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

export const alertaTipo = pgEnum("alerta_tipo", [
  "cobranzas",
  "ventas_perdidas",
  "minutas",
  "cumplimiento",
  "dependencia",
  "cotizacion_factura",
  "cotizaciones_viejas",
]);

export const alertaSeveridad = pgEnum("alerta_severidad", ["alta", "media", "baja"]);

export const alertaEstado = pgEnum("alerta_estado", ["abierta", "resuelta"]);

// ── Auth propio (reemplaza auth.users / Supabase Auth) ─────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// ── Catálogos / identidad ───────────────────────────────────────────────────
export const sucursales = pgTable("sucursales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull().unique(),
  ciudad: text("ciudad"),
  activa: boolean("activa").notNull().default(true),
  // San Cristóbal solo existe para las hojas de Mercadeo (Google My Business).
  // `false` la oculta de getSucursalesAction(), que alimenta todos los
  // FilterHeader del sistema. Ver docs/superpowers/specs/2026-08-02-mercadeo-design.md §2.
  visibleGeneral: boolean("visible_general").notNull().default(true),
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

// Multi-sucursal para coordinador (alcance en más de una sucursal, ej. Luiled
// Urdaneta cubre 2 sucursales). profiles.sucursalId sigue siendo la sucursal
// "primaria" (usada para defaults en formularios); esta tabla es la fuente de
// verdad para RLS (can_read_row) cuando un coordinador tiene más de una.
export const profileSucursales = pgTable(
  "profile_sucursales",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sucursalId: uuid("sucursal_id")
      .notNull()
      .references(() => sucursales.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.sucursalId] })],
);

// Visibilidad de módulos por rol, editable desde /usuarios (config en vez de
// código) — reemplaza el MODULE_ACCESS estático de src/lib/permissions.ts
// como fuente de verdad en runtime. El scope de datos (sucursal/unidad/asesor)
// sigue siendo RLS pura, intencionalmente NO configurable desde acá.
export const roleModuleAccess = pgTable(
  "role_module_access",
  {
    role: appRole("role").notNull(),
    module: text("module").notNull(),
    canView: boolean("can_view").notNull().default(true),
    canCreate: boolean("can_create").notNull().default(false),
    canEdit: boolean("can_edit").notNull().default(false),
    canDelete: boolean("can_delete").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.role, t.module] })],
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
export const cotizaciones = pgTable(
  "cotizaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fecha: date("fecha").notNull(),
    cliente: text("cliente").notNull(),
    asesorCodigo: text("asesor_codigo"),
    asesorId: uuid("asesor_id"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    nroCotizacion: text("nro_cotizacion"),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    montoFacturado: numeric("monto_facturado", { precision: 14, scale: 2 }).notNull().default("0"),
    montoPerdido: numeric("monto_perdido", { precision: 14, scale: 2 }).notNull().default("0"),
    etapa: cotizacionEtapa("etapa").notNull().default("desarrollo"),
    descripcion: text("descripcion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cotizaciones_fecha_idx").on(t.fecha),
    index("cotizaciones_sucursal_id_fecha_idx").on(t.sucursalId, t.fecha),
    index("cotizaciones_asesor_id_idx").on(t.asesorId),
  ],
);

export const facturas = pgTable(
  "facturas",
  {
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
  },
  (t) => [
    index("facturas_fecha_idx").on(t.fecha),
    index("facturas_sucursal_id_fecha_idx").on(t.sucursalId, t.fecha),
    index("facturas_asesor_id_idx").on(t.asesorId),
  ],
);

export const ventasPerdidas = pgTable(
  "ventas_perdidas",
  {
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
  },
  (t) => [
    index("ventas_perdidas_fecha_idx").on(t.fecha),
    index("ventas_perdidas_asesor_id_idx").on(t.asesorId),
  ],
);

export const servicios = pgTable(
  "servicios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fecha: date("fecha").notNull(),
    cliente: text("cliente").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    tipoServicio: text("tipo_servicio"),
    categoriaVenta: text("categoria_venta"),
    compania: text("compania"),
    asesor: text("asesor"),
    taller: text("taller"),
    csa: text("csa"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("servicios_fecha_idx").on(t.fecha),
    index("servicios_sucursal_id_fecha_idx").on(t.sucursalId, t.fecha),
  ],
);

export const detallesServiciosEstrategicos = pgTable(
  "detalles_servicios_estrategicos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    mes: integer("mes").notNull(),
    tipoServicio: text("tipo_servicio").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("detalles_servicios_estrategicos_mes_idx").on(t.mes)],
);

// Hoja Excel "Servicios Interno": solo Mes + Monto, sin sucursal/año (mismo patrón
// que detalles_servicios_estrategicos — snapshot de un solo año por carga).
export const serviciosInterno = pgTable(
  "servicios_interno",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mes: integer("mes").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("servicios_interno_mes_idx").on(t.mes)],
);

// Hoja Excel "Ventas Casa": ventas de atención casa por sucursal/unidad de
// negocio/mes, sin asesor asociado (no tienen asesor asignado). Sin columna
// año — mismo patrón snapshot-de-un-año que servicios_interno.
export const ventasCasa = pgTable(
  "ventas_casa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    mes: integer("mes").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ventas_casa_mes_idx").on(t.mes),
    index("ventas_casa_sucursal_id_idx").on(t.sucursalId),
    index("ventas_casa_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

export const cobranzas = pgTable(
  "cobranzas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cliente: text("cliente").notNull(),
    facturaNumero: text("factura_numero"),
    fechaEmision: date("fecha_emision").notNull(),
    fechaVencimiento: date("fecha_vencimiento").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    saldo: numeric("saldo", { precision: 14, scale: 2 }).notNull().default("0"),
    diasVencidos: integer("dias_vencidos").notNull().default(0),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // can_read_row() (RLS) filtra por estas dos columnas en cada SELECT para
  // coordinador/gerente_comercial — sin indice, Seq Scan garantizado.
  (t) => [
    index("cobranzas_sucursal_id_idx").on(t.sucursalId),
    index("cobranzas_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

/**
 * Tabla de snapshots históricos de cobranzas.
 * ACUMULA una fila de historia por cada carga semanal (no se borra nunca, a diferencia
 * de `cobranzas` que sí se reemplaza) — es intencional, es la única fuente de tendencia
 * que tenemos ya que el Excel no trae histórico.
 */
export const cobranzasSnapshots = pgTable(
  "cobranzas_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cliente: text("cliente").notNull(),
    facturaNumero: text("factura_numero"),
    fechaEmision: date("fecha_emision").notNull(),
    fechaVencimiento: date("fecha_vencimiento").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    saldo: numeric("saldo", { precision: 14, scale: 2 }).notNull().default("0"),
    diasVencidos: integer("dias_vencidos").notNull().default(0),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cobranzas_snapshots_captured_at_idx").on(t.capturedAt)],
);

// Cartera de Equipos/Alquiler — sin unidad_negocio_id
export const cobranzasEquipos = pgTable(
  "cobranzas_equipos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cliente: text("cliente").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    saldo: numeric("saldo", { precision: 14, scale: 2 }).notNull().default("0"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cobranzas_equipos_sucursal_id_idx").on(t.sucursalId)],
);

export const minutas = pgTable(
  "minutas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fecha: date("fecha").notNull().defaultNow(),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    // Destinatario: la persona sobre quien trata la minuta (asesor o coordinador
    // siendo dirigido por su superior). Reemplaza el antiguo `responsable` de
    // texto libre — ver docs/grilling minutas jerárquicas.
    destinatarioId: uuid("destinatario_id")
      .notNull()
      .references(() => users.id),
    cliente: text("cliente"),
    descripcion: text("descripcion").notNull(),
    fechaLimite: date("fecha_limite"),
    estado: minutaEstado("estado").notNull().default("pendiente"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("minutas_sucursal_id_idx").on(t.sucursalId),
    index("minutas_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

export const minutaComentarios = pgTable("minuta_comentarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  minutaId: uuid("minuta_id")
    .notNull()
    .references(() => minutas.id, { onDelete: "cascade" }),
  autorId: uuid("autor_id")
    .notNull()
    .references(() => users.id),
  texto: text("texto").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Alertas persistidas — antes se calculaban al vuelo en /alertas (useMemo
// client-side); ahora se reconcilian server-side en cada visita para poder
// engancharlas a minutas y llevar estado abierta/resuelta.
export const alertas = pgTable(
  "alertas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: alertaTipo("tipo").notNull(),
    severidad: alertaSeveridad("severidad").notNull(),
    titulo: text("titulo").notNull(),
    contexto: text("contexto"), // JSON serializado: cliente/monto/asesor/etc.
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    // uuid resuelto del asesor al que concierne la alerta (nullable — no todos
    // los tipos de alerta son atribuibles a un asesor puntual, ej. cobranzas).
    asesorId: uuid("asesor_id"),
    // UNIQUE (no solo indice): reconcileAlertasAction hace INSERT ... ON
    // CONFLICT sobre esta columna para evitar duplicar la misma alerta ante
    // visitas concurrentes (ver migracion 0014_alertas_clave_natural_unique).
    claveNatural: text("clave_natural").notNull().unique(),
    estado: alertaEstado("estado").notNull().default("abierta"),
    resueltaManualmente: boolean("resuelta_manualmente").notNull().default(false),
    resueltaPor: uuid("resuelta_por").references(() => users.id),
    resueltaEn: timestamp("resuelta_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alertas_sucursal_id_idx").on(t.sucursalId),
    index("alertas_unidad_negocio_id_idx").on(t.unidadNegocioId),
    index("alertas_asesor_id_idx").on(t.asesorId),
  ],
);

export const minutaAlertas = pgTable(
  "minuta_alertas",
  {
    minutaId: uuid("minuta_id")
      .notNull()
      .references(() => minutas.id, { onDelete: "cascade" }),
    alertaId: uuid("alerta_id")
      .notNull()
      .references(() => alertas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.minutaId, t.alertaId] })],
);

// ── Presupuesto / cumplimiento ──────────────────────────────────────────────
// Fuente de verdad del KPI "Facturado" (no `facturas`, que es transaccional y
// no reconciliada). Sin columna `cliente` ni `asesor` — es agregado mensual.
export const presupuestos = pgTable(
  "presupuestos",
  {
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
  },
  (t) => [
    index("presupuestos_anio_mes_idx").on(t.anio, t.mes),
    index("presupuestos_sucursal_id_idx").on(t.sucursalId),
    index("presupuestos_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

/**
 * Ajustes manuales de venta/facturado, solo rol gerencia. Vive fuera del
 * ciclo DELETE+INSERT de la carga automática (Excel/automatización) a
 * propósito: esas cargas reemplazan `facturas`/`presupuestos` por completo en
 * cada corrida, y un ajuste manual guardado ahí se perdería sin aviso en la
 * siguiente carga. Se suma aparte en las consultas de reporte, nunca se
 * mezcla en las tablas que la automatización controla.
 */
export const ajustesManuales = pgTable(
  "ajustes_manuales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anio: integer("anio").notNull(),
    mes: integer("mes").notNull(),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
    motivo: text("motivo").notNull(),
    creadoPor: uuid("creado_por")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ajustes_manuales_anio_mes_idx").on(t.anio, t.mes),
    index("ajustes_manuales_sucursal_id_idx").on(t.sucursalId),
    index("ajustes_manuales_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

// Única tabla con el nombre completo del asesor junto a su código.
export const cumplimientoAsesores = pgTable(
  "cumplimiento_asesores",
  {
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
    pctParticipacion: numeric("pct_participacion", { precision: 7, scale: 4 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cumplimiento_asesores_anio_mes_idx").on(t.anio, t.mes),
    index("cumplimiento_asesores_sucursal_id_idx").on(t.sucursalId),
    index("cumplimiento_asesores_unidad_negocio_id_idx").on(t.unidadNegocioId),
    index("cumplimiento_asesores_asesor_id_idx").on(t.asesorId),
  ],
);

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
// disponible/transito = monto en USD (columna "Total USD$" del Excel);
// stockDisponible/stockTransito = cantidad de unidades (columna "Stock").
// tipoEquipo = "Tipo de Equipo" del Excel (Generador, Transpaleta, etc.).
export const equiposInventario = pgTable(
  "equipos_inventario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anio: integer("anio").notNull(),
    mes: integer("mes").notNull(),
    marca: text("marca").notNull(),
    tipoEquipo: text("tipo_equipo").notNull().default("Sin clasificar"),
    disponible: numeric("disponible", { precision: 14, scale: 2 }).notNull().default("0"),
    transito: numeric("transito", { precision: 14, scale: 2 }).notNull().default("0"),
    stockDisponible: integer("stock_disponible").notNull().default(0),
    stockTransito: integer("stock_transito").notNull().default(0),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipos_inventario_sucursal_id_idx").on(t.sucursalId),
    index("equipos_inventario_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

export const equiposFacturacion = pgTable(
  "equipos_facturacion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anio: integer("anio").notNull(),
    mes: integer("mes").notNull(),
    facturado: numeric("facturado", { precision: 14, scale: 2 }).notNull().default("0"),
    presupuesto: numeric("presupuesto", { precision: 14, scale: 2 }).notNull().default("0"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipos_facturacion_sucursal_id_idx").on(t.sucursalId),
    index("equipos_facturacion_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

export const equiposPresupuesto = pgTable(
  "equipos_presupuesto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anio: integer("anio").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipos_presupuesto_sucursal_id_idx").on(t.sucursalId),
    index("equipos_presupuesto_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

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

export const equiposPorMarca = pgTable(
  "equipos_por_marca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anio: integer("anio").notNull(),
    mes: integer("mes").notNull(),
    marca: text("marca").notNull(),
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    unidadNegocioId: uuid("unidad_negocio_id").references(() => unidadesNegocio.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipos_por_marca_sucursal_id_idx").on(t.sucursalId),
    index("equipos_por_marca_unidad_negocio_id_idx").on(t.unidadNegocioId),
  ],
);

// ── Lubricantes y Filtros (hojas Excel "Detalles de Ventas LUBFILTROS" /
// "Inventario LubFiltros") — snapshot de un solo año, sin columna año (mismo
// patrón que detalles_servicios_estrategicos / servicios_interno). Sin RLS,
// igual que esas dos tablas: acceso controlado por rol en la UI, no por fila.
export const detallesVentasLubfiltros = pgTable(
  "detalles_ventas_lubfiltros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marca: text("marca").notNull(),
    mes: integer("mes").notNull(),
    ventasCcv: numeric("ventas_ccv", { precision: 14, scale: 2 }).notNull().default("0"),
    ventasXibi: numeric("ventas_xibi", { precision: 14, scale: 2 }).notNull().default("0"),
    ventasEstrategicas: numeric("ventas_estrategicas", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("detalles_ventas_lubfiltros_mes_idx").on(t.mes)],
);

// `sucursal` es texto libre desde la columna "Nombre Sucursal" del Excel —
// incluye valores como "Almacen Central" que no son sucursales físicas del
// catálogo, mismo patrón que equipos_facturacion_sucursal.
export const inventarioLubfiltros = pgTable("inventario_lubfiltros", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: text("tipo").notNull(), // "Lubricantes" | "Filtros" — derivado de la columna SUPLIDOR
  proveedorCodigo: text("proveedor_codigo").notNull(), // CO, NC, DN, D1, GF
  sucursal: text("sucursal").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Repuestos (hoja Excel "Detalles de Ventas Repuestos") — misma forma que
// detalles_ventas_lubfiltros pero sin columna Estratégico (el Excel fuente no
// la trae para esta unidad). Snapshot de un solo año, sin RLS (mismo patrón).
export const detallesVentasRepuestos = pgTable(
  "detalles_ventas_repuestos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marca: text("marca").notNull(),
    mes: integer("mes").notNull(),
    ventasCcv: numeric("ventas_ccv", { precision: 14, scale: 2 }).notNull().default("0"),
    ventasXibi: numeric("ventas_xibi", { precision: 14, scale: 2 }).notNull().default("0"),
    montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("detalles_ventas_repuestos_mes_idx").on(t.mes)],
);

// ── Mercadeo ────────────────────────────────────────────────────────────────
// Hojas Excel: Canales, Instagram, Google My Business, Post Historias,
// Clientes Potenciales. `canal`/`tipo` son texto libre (sin catálogo propio).

export const mercadeoCanales = pgTable(
  "mercadeo_canales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canal: text("canal").notNull(),
    tipo: text("tipo").notNull(),
    mes: integer("mes").notNull(),
    cantidad: numeric("cantidad", { precision: 16, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mercadeo_canales_mes_idx").on(t.mes)],
);

export const mercadeoInstagram = pgTable(
  "mercadeo_instagram",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: text("tipo").notNull(),
    mes: integer("mes").notNull(),
    cantidad: numeric("cantidad", { precision: 16, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mercadeo_instagram_mes_idx").on(t.mes)],
);

export const mercadeoGoogleBusiness = pgTable(
  "mercadeo_google_business",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    mes: integer("mes").notNull(),
    tipo: text("tipo").notNull(),
    cantidad: numeric("cantidad", { precision: 16, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mercadeo_gmb_mes_idx").on(t.mes)],
);

export const mercadeoPostHistorias = pgTable(
  "mercadeo_post_historias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipoPublicacion: text("tipo_publicacion").notNull(),
    // Texto libre: incluye categorías de contenido que no son unidades reales
    // (Entrenamiento, Branding, RRHH, Eventos, Proyectos, Talleres, Efemérides).
    unidadNegocio: text("unidad_negocio"),
    marca: text("marca"),
    mes: integer("mes").notNull(),
    cantidad: integer("cantidad").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mercadeo_post_historias_mes_idx").on(t.mes)],
);

export const clientesPotenciales = pgTable(
  "clientes_potenciales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idClientePotencial: integer("id_cliente_potencial"),
    sucursalId: uuid("sucursal_id").references(() => sucursales.id),
    // Texto libre: incluye "Entrenamiento Técnico", que no es unidad real.
    tipoNegocio: text("tipo_negocio"),
    razonSocial: text("razon_social"),
    nombreContacto: text("nombre_contacto"),
    correo: text("correo"),
    telefono: text("telefono"),
    identificacionFiscal: text("identificacion_fiscal"),
    fechaDetectada: date("fecha_detectada"),
    estatusBis: text("estatus_bis"),
    etapaOportunidad: text("etapa_oportunidad"),
    tomaContacto: text("toma_contacto"),
    campana: text("campana"),
    usuarioAsignado: text("usuario_asignado"),
    ingresosEsperados: numeric("ingresos_esperados", { precision: 16, scale: 2 })
      .notNull()
      .default("0"),
    montoFacturadoBase: numeric("monto_facturado_base", { precision: 16, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("clientes_potenciales_estatus_idx").on(t.estatusBis),
    index("clientes_potenciales_tipo_negocio_idx").on(t.tipoNegocio),
    index("clientes_potenciales_fecha_idx").on(t.fechaDetectada),
  ],
);
