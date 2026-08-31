CREATE TABLE "detalles_ventas_repuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marca" text NOT NULL,
	"mes" integer NOT NULL,
	"ventas_ccv" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_xibi" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monto_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "detalles_ventas_repuestos_mes_idx" ON "detalles_ventas_repuestos" USING btree ("mes");