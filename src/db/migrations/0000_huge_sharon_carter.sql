CREATE TYPE "public"."app_role" AS ENUM('gerencia', 'gerente_comercial', 'coordinador', 'asesor');--> statement-breakpoint
CREATE TYPE "public"."cotizacion_etapa" AS ENUM('desarrollo', 'propuesta_negociacion', 'venta_perdida', 'desconocido');--> statement-breakpoint
CREATE TYPE "public"."minuta_estado" AS ENUM('pendiente', 'en_proceso', 'cumplido');--> statement-breakpoint
CREATE TABLE "cobranzas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente" text NOT NULL,
	"factura_numero" text,
	"fecha_emision" date NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobranzas_equipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente" text NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comisiones_reglas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidad_negocio_id" uuid,
	"umbral_min_pct" numeric(7, 4) NOT NULL,
	"umbral_max_pct" numeric(7, 4),
	"tasa_comision" numeric(7, 4) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"cliente" text NOT NULL,
	"asesor_codigo" text,
	"asesor_id" uuid,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"nro_cotizacion" text,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monto_facturado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monto_perdido" numeric(14, 2) DEFAULT '0' NOT NULL,
	"etapa" "cotizacion_etapa" DEFAULT 'desarrollo' NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cumplimiento_asesores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"codigo_asesor" text NOT NULL,
	"asesor" text NOT NULL,
	"asesor_id" uuid,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"presupuesto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"venta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pct_cumplimiento" numeric(7, 4) DEFAULT '0' NOT NULL,
	"pct_participacion" numeric(7, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos_facturacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"facturado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"presupuesto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos_facturacion_sucursal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"sucursal" text NOT NULL,
	"facturado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"marca" text NOT NULL,
	"disponible" numeric(14, 2) DEFAULT '0' NOT NULL,
	"transito" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos_por_marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"marca" text NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipos_presupuesto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"numero" text,
	"cliente" text NOT NULL,
	"asesor" text,
	"asesor_id" uuid,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minutas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"cliente" text NOT NULL,
	"descripcion" text NOT NULL,
	"responsable" text NOT NULL,
	"responsable_id" uuid,
	"fecha_limite" date,
	"estado" "minuta_estado" DEFAULT 'pendiente' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_ccv" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_xibi" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_estrategicas" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_unidades_negocio" (
	"profile_id" uuid NOT NULL,
	"unidad_negocio_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_unidades_negocio_profile_id_unidad_negocio_id_pk" PRIMARY KEY("profile_id","unidad_negocio_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre_completo" text,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"cliente" text NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tipo_servicio" text,
	"categoria_venta" text,
	"compania" text,
	"asesor" text,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"ciudad" text,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sucursales_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "unidades_negocio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unidades_negocio_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ventas_perdidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"cliente" text NOT NULL,
	"asesor" text,
	"asesor_id" uuid,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"razon" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobranzas" ADD CONSTRAINT "cobranzas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranzas" ADD CONSTRAINT "cobranzas_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranzas_equipos" ADD CONSTRAINT "cobranzas_equipos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones_reglas" ADD CONSTRAINT "comisiones_reglas_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cumplimiento_asesores" ADD CONSTRAINT "cumplimiento_asesores_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cumplimiento_asesores" ADD CONSTRAINT "cumplimiento_asesores_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_facturacion" ADD CONSTRAINT "equipos_facturacion_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_facturacion" ADD CONSTRAINT "equipos_facturacion_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_facturacion_sucursal" ADD CONSTRAINT "equipos_facturacion_sucursal_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_inventario" ADD CONSTRAINT "equipos_inventario_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_inventario" ADD CONSTRAINT "equipos_inventario_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_por_marca" ADD CONSTRAINT "equipos_por_marca_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_por_marca" ADD CONSTRAINT "equipos_por_marca_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_presupuesto" ADD CONSTRAINT "equipos_presupuesto_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos_presupuesto" ADD CONSTRAINT "equipos_presupuesto_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutas" ADD CONSTRAINT "minutas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutas" ADD CONSTRAINT "minutas_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutas" ADD CONSTRAINT "minutas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutas" ADD CONSTRAINT "minutas_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unidades_negocio" ADD CONSTRAINT "profile_unidades_negocio_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unidades_negocio" ADD CONSTRAINT "profile_unidades_negocio_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_perdidas" ADD CONSTRAINT "ventas_perdidas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_perdidas" ADD CONSTRAINT "ventas_perdidas_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cotizaciones_fecha_idx" ON "cotizaciones" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "cotizaciones_sucursal_id_fecha_idx" ON "cotizaciones" USING btree ("sucursal_id","fecha");--> statement-breakpoint
CREATE INDEX "cumplimiento_asesores_anio_mes_idx" ON "cumplimiento_asesores" USING btree ("anio","mes");--> statement-breakpoint
CREATE INDEX "facturas_fecha_idx" ON "facturas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "facturas_sucursal_id_fecha_idx" ON "facturas" USING btree ("sucursal_id","fecha");--> statement-breakpoint
CREATE INDEX "presupuestos_anio_mes_idx" ON "presupuestos" USING btree ("anio","mes");--> statement-breakpoint
CREATE INDEX "servicios_fecha_idx" ON "servicios" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "servicios_sucursal_id_fecha_idx" ON "servicios" USING btree ("sucursal_id","fecha");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ventas_perdidas_fecha_idx" ON "ventas_perdidas" USING btree ("fecha");