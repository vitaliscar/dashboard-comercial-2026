CREATE TABLE "ventas_casa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"mes" integer NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventas_casa" ADD CONSTRAINT "ventas_casa_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_casa" ADD CONSTRAINT "ventas_casa_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_casa_mes_idx" ON "ventas_casa" USING btree ("mes");