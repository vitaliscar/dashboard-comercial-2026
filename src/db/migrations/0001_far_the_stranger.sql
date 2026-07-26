-- detalles_servicios_estrategicos, servicios.taller/csa y cobranzas.dias_vencidos ya
-- existen en la BD (aplicados por fuera del tracking de Drizzle en un fix anterior).
-- Esta migración solo agrega lo que realmente falta: servicios_interno.
CREATE TABLE "servicios_interno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mes" integer NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "servicios_interno_mes_idx" ON "servicios_interno" USING btree ("mes");