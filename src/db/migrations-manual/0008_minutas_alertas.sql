-- Rediseño de minutas (coaching jerárquico) + alertas persistidas.
-- minutas: 0 filas en producción al momento de esta migración — se permite
-- ALTER destructivo (drop responsable/responsable_id, add destinatario_id NOT NULL)
-- sin backfill.

CREATE TYPE "public"."alerta_tipo" AS ENUM('cobranzas', 'ventas_perdidas', 'minutas', 'cumplimiento', 'dependencia', 'cotizacion_factura', 'cotizaciones_viejas');
CREATE TYPE "public"."alerta_severidad" AS ENUM('alta', 'media', 'baja');
CREATE TYPE "public"."alerta_estado" AS ENUM('abierta', 'resuelta');

-- Las policies viejas (select/insert/update_minutas) dependen de
-- responsable_id — hay que tumbarlas antes de poder dropear la columna.
DROP POLICY IF EXISTS select_minutas ON minutas;
DROP POLICY IF EXISTS insert_minutas ON minutas;
DROP POLICY IF EXISTS update_minutas ON minutas;

ALTER TABLE "minutas" DROP COLUMN IF EXISTS "responsable";
ALTER TABLE "minutas" DROP COLUMN IF EXISTS "responsable_id";
ALTER TABLE "minutas" ADD COLUMN "destinatario_id" uuid NOT NULL REFERENCES "users"("id");
ALTER TABLE "minutas" ALTER COLUMN "cliente" DROP NOT NULL;

CREATE TABLE "minuta_comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minuta_id" uuid NOT NULL REFERENCES "minutas"("id") ON DELETE CASCADE,
	"autor_id" uuid NOT NULL REFERENCES "users"("id"),
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "alerta_tipo" NOT NULL,
	"severidad" "alerta_severidad" NOT NULL,
	"titulo" text NOT NULL,
	"contexto" text,
	"sucursal_id" uuid REFERENCES "sucursales"("id"),
	"unidad_negocio_id" uuid REFERENCES "unidades_negocio"("id"),
	"asesor_id" uuid,
	"clave_natural" text NOT NULL,
	"estado" "alerta_estado" DEFAULT 'abierta' NOT NULL,
	"resuelta_manualmente" boolean DEFAULT false NOT NULL,
	"resuelta_por" uuid REFERENCES "users"("id"),
	"resuelta_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "alertas_clave_natural_idx" ON "alertas" ("clave_natural");

CREATE TABLE "minuta_alertas" (
	"minuta_id" uuid NOT NULL REFERENCES "minutas"("id") ON DELETE CASCADE,
	"alerta_id" uuid NOT NULL REFERENCES "alertas"("id") ON DELETE CASCADE,
	PRIMARY KEY ("minuta_id", "alerta_id")
);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE "minuta_comentarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alertas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "minuta_alertas" ENABLE ROW LEVEL SECURITY;

-- SELECT minutas: cascada por scope (igual patrón que el resto del dashboard)
-- más "siempre veo lo mío como destinatario" incluso si el scope no calza
-- perfecto (defensa en profundidad).
DROP POLICY IF EXISTS select_minutas ON minutas;
CREATE POLICY select_minutas ON minutas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL) OR destinatario_id = current_user_id());

-- INSERT minutas: asesor nunca crea. coordinador -> solo a asesores de su
-- sucursal. gerente_comercial -> solo a coordinadores de su unidad.
-- gerencia -> cualquiera. Se valida el rol del destinatario contra user_roles.
DROP POLICY IF EXISTS insert_minutas ON minutas;
CREATE POLICY insert_minutas ON minutas FOR INSERT
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND (
      current_app_role() = 'gerencia'
      OR (
        current_app_role() = 'coordinador'
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = destinatario_id AND ur.role = 'asesor')
      )
      OR (
        current_app_role() = 'gerente_comercial'
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = destinatario_id AND ur.role = 'coordinador')
      )
    )
  );

-- UPDATE minutas (estado/descripción): solo el autor o alguien por encima en
-- la cadena (nunca el propio destinatario) — mismo criterio de rol que INSERT.
DROP POLICY IF EXISTS update_minutas ON minutas;
CREATE POLICY update_minutas ON minutas FOR UPDATE
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL) AND current_app_role() <> 'asesor')
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, NULL) AND current_app_role() <> 'asesor');

-- minuta_comentarios: visibles a quien puede ver la minuta; solo el
-- destinatario de la minuta puede comentar.
CREATE POLICY select_minuta_comentarios ON minuta_comentarios FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM minutas m
    WHERE m.id = minuta_id
      AND (can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL) OR m.destinatario_id = current_user_id())
  ));
CREATE POLICY insert_minuta_comentarios ON minuta_comentarios FOR INSERT
  WITH CHECK (
    autor_id = current_user_id()
    AND EXISTS (SELECT 1 FROM minutas m WHERE m.id = minuta_id AND m.destinatario_id = current_user_id())
  );

-- alertas: RLS solo scopea por sucursal/unidad/asesor (igual patrón que el
-- resto del dashboard). El recálculo automático (abrir/cerrar según
-- condición) corre para cualquier rol que visite /alertas, incluido asesor
-- sobre sus propias filas — por eso UPDATE no excluye ningún rol aquí. La
-- restricción de que SOLO coordinador+ pueda resolver manualmente vive en la
-- capa de aplicación (resolveAlertaAction), no en RLS.
CREATE POLICY select_alertas ON alertas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY insert_alertas ON alertas FOR INSERT
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY update_alertas ON alertas FOR UPDATE
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id))
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));

-- minuta_alertas: sigue los mismos permisos que la minuta a la que pertenece.
CREATE POLICY select_minuta_alertas ON minuta_alertas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM minutas m
    WHERE m.id = minuta_id
      AND (can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL) OR m.destinatario_id = current_user_id())
  ));
CREATE POLICY insert_minuta_alertas ON minuta_alertas FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM minutas m WHERE m.id = minuta_id AND can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL)
  ));
