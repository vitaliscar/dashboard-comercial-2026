CREATE TABLE "clientes_potenciales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_cliente_potencial" integer,
	"sucursal_id" uuid,
	"tipo_negocio" text,
	"razon_social" text,
	"nombre_contacto" text,
	"correo" text,
	"telefono" text,
	"identificacion_fiscal" text,
	"fecha_detectada" date,
	"estatus_bis" text,
	"etapa_oportunidad" text,
	"toma_contacto" text,
	"campana" text,
	"usuario_asignado" text,
	"ingresos_esperados" numeric(16, 2) DEFAULT '0' NOT NULL,
	"monto_facturado_base" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercadeo_canales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" text NOT NULL,
	"tipo" text NOT NULL,
	"mes" integer NOT NULL,
	"cantidad" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercadeo_google_business" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sucursal_id" uuid,
	"mes" integer NOT NULL,
	"tipo" text NOT NULL,
	"cantidad" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercadeo_instagram" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"mes" integer NOT NULL,
	"cantidad" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercadeo_post_historias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_publicacion" text NOT NULL,
	"unidad_negocio" text,
	"marca" text,
	"mes" integer NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "visible_general" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes_potenciales" ADD CONSTRAINT "clientes_potenciales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadeo_google_business" ADD CONSTRAINT "mercadeo_google_business_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_potenciales_estatus_idx" ON "clientes_potenciales" USING btree ("estatus_bis");--> statement-breakpoint
CREATE INDEX "clientes_potenciales_tipo_negocio_idx" ON "clientes_potenciales" USING btree ("tipo_negocio");--> statement-breakpoint
CREATE INDEX "clientes_potenciales_fecha_idx" ON "clientes_potenciales" USING btree ("fecha_detectada");--> statement-breakpoint
CREATE INDEX "mercadeo_canales_mes_idx" ON "mercadeo_canales" USING btree ("mes");--> statement-breakpoint
CREATE INDEX "mercadeo_gmb_mes_idx" ON "mercadeo_google_business" USING btree ("mes");--> statement-breakpoint
CREATE INDEX "mercadeo_instagram_mes_idx" ON "mercadeo_instagram" USING btree ("mes");--> statement-breakpoint
CREATE INDEX "mercadeo_post_historias_mes_idx" ON "mercadeo_post_historias" USING btree ("mes");