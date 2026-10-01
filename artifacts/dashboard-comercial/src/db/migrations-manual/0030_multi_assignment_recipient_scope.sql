-- Permite resolver roles y asignaciones de destinatarios con alcances múltiples.
-- Ejecutar manualmente con app_admin (BYPASSRLS) después de migraciones 0025-0029.
-- No amplía datos comerciales: cada rol solo ve perfiles con asignación coincidente.

BEGIN;

CREATE OR REPLACE FUNCTION can_read_profile_scope(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
    WHEN current_app_role() = 'coordinador' THEN EXISTS (
      WITH own_branches AS (
        SELECT ps.sucursal_id FROM profile_sucursales ps WHERE ps.profile_id = current_user_id()
        UNION ALL
        SELECT p.sucursal_id FROM profiles p
        WHERE p.id = current_user_id() AND p.sucursal_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM profile_sucursales ps WHERE ps.profile_id = current_user_id())
      ), target_branches AS (
        SELECT ps.sucursal_id FROM profile_sucursales ps WHERE ps.profile_id = _profile_id
        UNION ALL
        SELECT p.sucursal_id FROM profiles p
        WHERE p.id = _profile_id AND p.sucursal_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM profile_sucursales ps WHERE ps.profile_id = _profile_id)
      )
      SELECT 1 FROM own_branches own JOIN target_branches target USING (sucursal_id)
    )
    WHEN current_app_role() = 'gerente_comercial' THEN EXISTS (
      WITH own_units AS (
        SELECT pun.unidad_negocio_id FROM profile_unidades_negocio pun WHERE pun.profile_id = current_user_id()
        UNION ALL
        SELECT p.unidad_negocio_id FROM profiles p
        WHERE p.id = current_user_id() AND p.unidad_negocio_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM profile_unidades_negocio pun WHERE pun.profile_id = current_user_id())
      ), target_units AS (
        SELECT pun.unidad_negocio_id FROM profile_unidades_negocio pun WHERE pun.profile_id = _profile_id
        UNION ALL
        SELECT p.unidad_negocio_id FROM profiles p
        WHERE p.id = _profile_id AND p.unidad_negocio_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM profile_unidades_negocio pun WHERE pun.profile_id = _profile_id)
      )
      SELECT 1 FROM own_units own JOIN target_units target USING (unidad_negocio_id)
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION can_read_profile_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_read_profile_scope(uuid) TO app_user;

DROP POLICY IF EXISTS select_profiles ON profiles;
CREATE POLICY select_profiles ON profiles FOR SELECT
  USING (id = current_user_id() OR can_read_profile_scope(id));

DROP POLICY IF EXISTS select_user_roles ON user_roles;
CREATE POLICY select_user_roles ON user_roles FOR SELECT
  USING (user_id = current_user_id() OR can_read_profile_scope(user_id));

DROP POLICY IF EXISTS select_profile_sucursales ON profile_sucursales;
CREATE POLICY select_profile_sucursales ON profile_sucursales FOR SELECT
  USING (
    profile_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'coordinador'
      AND can_read_profile_scope(profile_id)
      AND can_read_row(sucursal_id, NULL, NULL)
    )
  );

DROP POLICY IF EXISTS select_profile_unidades_negocio ON profile_unidades_negocio;
CREATE POLICY select_profile_unidades_negocio ON profile_unidades_negocio FOR SELECT
  USING (
    profile_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'gerente_comercial'
      AND can_read_profile_scope(profile_id)
      AND can_read_row(NULL, unidad_negocio_id, NULL)
    )
  );

COMMIT;
