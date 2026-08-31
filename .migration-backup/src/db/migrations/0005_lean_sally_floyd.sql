ALTER TABLE "equipos_inventario" ADD COLUMN "tipo_equipo" text DEFAULT 'Sin clasificar' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipos_inventario" ADD COLUMN "stock_disponible" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "equipos_inventario" ADD COLUMN "stock_transito" integer DEFAULT 0 NOT NULL;