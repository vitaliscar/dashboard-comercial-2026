-- Multi-sucursal para coordinador (ej. Luiled Urdaneta cubre 2 sucursales).
-- Mismo patrón que profile_unidades_negocio para gerente_comercial.
-- Ejecutar con el rol app_admin (BYPASSRLS).

CREATE TABLE "profile_sucursales" (
	"profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
	"sucursal_id" uuid NOT NULL REFERENCES "sucursales"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("profile_id", "sucursal_id")
);

-- Backfill: todo profile con sucursal_id ya asignada arranca con esa sucursal
-- en la tabla multi — coordinadores existentes no pierden acceso.
INSERT INTO profile_sucursales (profile_id, sucursal_id)
SELECT id, sucursal_id FROM profiles WHERE sucursal_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE profile_sucursales ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_profile_sucursales ON profile_sucursales FOR SELECT
  USING (profile_id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY insert_profile_sucursales_admin_only ON profile_sucursales FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profile_sucursales_admin_only ON profile_sucursales FOR DELETE
  USING (current_app_role() = 'gerencia');

-- can_read_row: coordinador ahora chequea membresía en profile_sucursales en
-- vez de igualdad contra el GUC de sesión app.current_sucursal_id (que solo
-- guardaba una sucursal primaria) — soporta 2+ sucursales por coordinador.
CREATE OR REPLACE FUNCTION can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN _sucursal IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_sucursales ps
      WHERE ps.profile_id = current_user_id() AND ps.sucursal_id = _sucursal
    )
    WHEN 'asesor' THEN _asesor IS NOT NULL AND _asesor = current_user_id()
    ELSE false
  END;
$$;
