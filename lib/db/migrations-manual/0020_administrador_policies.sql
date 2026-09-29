-- Continuación de 0019: policies + funciones (después de COMMIT del ADD VALUE).
-- Ejecutar DESPUÉS de 0019_administrador_role.sql.

-- ── Lectura de negocio: administrador = gerencia ────────────────────────────
CREATE OR REPLACE FUNCTION can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
    WHEN current_app_role() = 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN current_app_role() = 'coordinador' THEN _sucursal IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_sucursales ps
      WHERE ps.profile_id = current_user_id() AND ps.sucursal_id = _sucursal
    )
    WHEN current_app_role() = 'asesor' THEN _asesor IS NOT NULL AND _asesor = current_user_id()
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION can_read_row_by_unidad_only(_unidad uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
    WHEN current_app_role() = 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN current_app_role() = 'coordinador' THEN true
    WHEN current_app_role() = 'asesor' THEN true
    ELSE false
  END;
$$;

-- ── SELECT identidad: incluir administrador (preserva fuerza de venta) ──────
DROP POLICY IF EXISTS select_users ON users;
CREATE POLICY select_users ON users FOR SELECT
  USING (
    id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
  );

DROP POLICY IF EXISTS select_profiles ON profiles;
CREATE POLICY select_profiles ON profiles FOR SELECT
  USING (
    id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'coordinador'
      AND sucursal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id() AND ps.sucursal_id = profiles.sucursal_id
      )
    )
    OR (
      current_app_role() = 'gerente_comercial'
      AND unidad_negocio_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun
        WHERE pun.profile_id = current_user_id()
          AND pun.unidad_negocio_id = profiles.unidad_negocio_id
      )
    )
  );

DROP POLICY IF EXISTS select_user_roles ON user_roles;
CREATE POLICY select_user_roles ON user_roles FOR SELECT
  USING (
    user_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'coordinador'
      AND EXISTS (
        SELECT 1
        FROM profiles p
        JOIN profile_sucursales ps ON ps.sucursal_id = p.sucursal_id
        WHERE p.id = user_roles.user_id AND ps.profile_id = current_user_id()
      )
    )
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1
        FROM profiles p
        JOIN profile_unidades_negocio pun ON pun.unidad_negocio_id = p.unidad_negocio_id
        WHERE p.id = user_roles.user_id AND pun.profile_id = current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS select_profile_unidades_negocio ON profile_unidades_negocio;
CREATE POLICY select_profile_unidades_negocio ON profile_unidades_negocio FOR SELECT
  USING (
    profile_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
  );

DROP POLICY IF EXISTS select_profile_sucursales ON profile_sucursales;
CREATE POLICY select_profile_sucursales ON profile_sucursales FOR SELECT
  USING (
    profile_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
  );

-- ── Alta users/profiles: SOLO administrador ─────────────────────────────────
DROP POLICY IF EXISTS insert_users_admin_only ON users;
DROP POLICY IF EXISTS insert_profiles_admin_only ON profiles;
CREATE POLICY insert_users_admin_only ON users FOR INSERT
  WITH CHECK (current_app_role() = 'administrador');
CREATE POLICY insert_profiles_admin_only ON profiles FOR INSERT
  WITH CHECK (current_app_role() = 'administrador');

-- user_roles: admin crea usuarios; gerencia reasigna roles (delete+insert)
DROP POLICY IF EXISTS insert_user_roles_admin_only ON user_roles;
CREATE POLICY insert_user_roles_admin_only ON user_roles FOR INSERT
  WITH CHECK (current_app_role() IN ('administrador', 'gerencia'));

-- ── Baja users/profiles: SOLO administrador ─────────────────────────────────
DROP POLICY IF EXISTS delete_users_admin_only ON users;
DROP POLICY IF EXISTS delete_profiles_admin_only ON profiles;
CREATE POLICY delete_users_admin_only ON users FOR DELETE
  USING (current_app_role() = 'administrador');
CREATE POLICY delete_profiles_admin_only ON profiles FOR DELETE
  USING (current_app_role() = 'administrador');

DROP POLICY IF EXISTS delete_user_roles_admin_only ON user_roles;
CREATE POLICY delete_user_roles_admin_only ON user_roles FOR DELETE
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS delete_sessions_own_or_admin ON sessions;
CREATE POLICY delete_sessions_own_or_admin ON sessions FOR DELETE
  USING (
    user_id = current_user_id()
    OR current_app_role() IN ('administrador', 'gerencia')
  );

-- ── Edición: administrador o gerencia ───────────────────────────────────────
DROP POLICY IF EXISTS update_profiles_admin_only ON profiles;
DROP POLICY IF EXISTS update_users_admin_only ON users;
CREATE POLICY update_profiles_admin_only ON profiles FOR UPDATE
  USING (current_app_role() IN ('administrador', 'gerencia'))
  WITH CHECK (current_app_role() IN ('administrador', 'gerencia'));
CREATE POLICY update_users_admin_only ON users FOR UPDATE
  USING (current_app_role() IN ('administrador', 'gerencia'))
  WITH CHECK (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS insert_profile_unidades_negocio_admin_only ON profile_unidades_negocio;
DROP POLICY IF EXISTS delete_profile_unidades_negocio_admin_only ON profile_unidades_negocio;
CREATE POLICY insert_profile_unidades_negocio_admin_only ON profile_unidades_negocio FOR INSERT
  WITH CHECK (current_app_role() IN ('administrador', 'gerencia'));
CREATE POLICY delete_profile_unidades_negocio_admin_only ON profile_unidades_negocio FOR DELETE
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS insert_profile_sucursales_admin_only ON profile_sucursales;
DROP POLICY IF EXISTS delete_profile_sucursales_admin_only ON profile_sucursales;
CREATE POLICY insert_profile_sucursales_admin_only ON profile_sucursales FOR INSERT
  WITH CHECK (current_app_role() IN ('administrador', 'gerencia'));
CREATE POLICY delete_profile_sucursales_admin_only ON profile_sucursales FOR DELETE
  USING (current_app_role() IN ('administrador', 'gerencia'));

-- Matriz de módulos: solo administrador
DROP POLICY IF EXISTS insert_role_module_access_admin_only ON role_module_access;
DROP POLICY IF EXISTS update_role_module_access_admin_only ON role_module_access;
DROP POLICY IF EXISTS delete_role_module_access_admin_only ON role_module_access;
CREATE POLICY insert_role_module_access_admin_only ON role_module_access FOR INSERT
  WITH CHECK (current_app_role() = 'administrador');
CREATE POLICY update_role_module_access_admin_only ON role_module_access FOR UPDATE
  USING (current_app_role() = 'administrador')
  WITH CHECK (current_app_role() = 'administrador');
CREATE POLICY delete_role_module_access_admin_only ON role_module_access FOR DELETE
  USING (current_app_role() = 'administrador');

-- Seed módulos para administrador
INSERT INTO role_module_access (role, module, can_view)
SELECT 'administrador'::app_role, module, true
FROM (VALUES
  ('resumen'), ('dashboard'), ('minutas'), ('cobranzas'), ('pareto'),
  ('asesores'), ('alertas'), ('embudo'), ('mercadeo'), ('carga'), ('usuarios'),
  ('gerencia_nacional'), ('coordinador'), ('asesor'), ('servicios'),
  ('lubfiltros'), ('equipos'), ('alquiler'), ('sucursal'), ('repuestos'),
  ('cliente_360'), ('comisiones'), ('simulador'), ('evaluacion'),
  ('ajustes_manuales')
) AS m(module)
ON CONFLICT (role, module) DO UPDATE SET can_view = EXCLUDED.can_view;
