-- Corrige drift documentado en 0001_far_the_stranger.sql: estas 3 piezas de
-- schema.ts nunca se generaron en una migración de Drizzle (se aplicaron a
-- mano contra la BD Supabase original) y por lo tanto faltan en una BD nueva
-- levantada solo desde 0000/0001. Necesarias para que load-excel.ts inserte
-- cobranzas.dias_vencidos, servicios.taller/csa y detalles_servicios_estrategicos.

ALTER TABLE "cobranzas" ADD COLUMN IF NOT EXISTS "dias_vencidos" integer DEFAULT 0 NOT NULL;

ALTER TABLE "servicios" ADD COLUMN IF NOT EXISTS "taller" text;
ALTER TABLE "servicios" ADD COLUMN IF NOT EXISTS "csa" text;

CREATE TABLE IF NOT EXISTS "detalles_servicios_estrategicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sucursal_id" uuid REFERENCES "sucursales"("id"),
	"mes" integer NOT NULL,
	"tipo_servicio" text NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "detalles_servicios_estrategicos_mes_idx" ON "detalles_servicios_estrategicos" USING btree ("mes");
