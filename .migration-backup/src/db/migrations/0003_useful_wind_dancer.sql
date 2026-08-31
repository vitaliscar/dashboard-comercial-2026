CREATE TABLE "cobranzas_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente" text NOT NULL,
	"factura_numero" text,
	"fecha_emision" date NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"dias_vencidos" integer DEFAULT 0 NOT NULL,
	"sucursal_id" uuid,
	"unidad_negocio_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobranzas_snapshots" ADD CONSTRAINT "cobranzas_snapshots_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranzas_snapshots" ADD CONSTRAINT "cobranzas_snapshots_unidad_negocio_id_unidades_negocio_id_fk" FOREIGN KEY ("unidad_negocio_id") REFERENCES "public"."unidades_negocio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobranzas_snapshots_captured_at_idx" ON "cobranzas_snapshots" USING btree ("captured_at");