CREATE TABLE "detalles_ventas_lubfiltros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marca" text NOT NULL,
	"mes" integer NOT NULL,
	"ventas_ccv" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_xibi" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ventas_estrategicas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monto_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario_lubfiltros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"proveedor_codigo" text NOT NULL,
	"sucursal" text NOT NULL,
	"monto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "detalles_ventas_lubfiltros_mes_idx" ON "detalles_ventas_lubfiltros" USING btree ("mes");