-- select_profiles solo permitía ver la fila propia o, si gerencia, todas.
-- Un coordinador/gerente_comercial no podía leer los perfiles de su fuerza
-- de venta (getDestinatariosDisponiblesAction en minutas.ts hace el JOIN
-- correcto, pero RLS descartaba las filas antes de llegar a la app), por lo
-- que el selector de destinatario de minuta aparecía vacío.
--
-- Regla: coordinador ve asesores de las sucursales en profile_sucursales
-- (multi-sucursal, ver 0009_profile_sucursales.sql) + a sí mismo;
-- gerente_comercial ve coordinadores y asesores de sus unidades de negocio
-- asignadas (profile_unidades_negocio) + a sí mismo; gerencia ve todo (ya
-- cubierto). Ejecutar como app_admin (BYPASSRLS).

DROP POLICY IF EXISTS select_profiles ON profiles;
CREATE POLICY select_profiles ON profiles FOR SELECT
  USING (
    id = current_user_id()
    OR current_app_role() = 'gerencia'
    OR (
      current_app_role() = 'coordinador'
      AND sucursal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id()
          AND ps.sucursal_id = profiles.sucursal_id
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

-- getDestinatariosDisponiblesAction hace innerJoin(userRoles, ...) sobre los
-- mismos perfiles — sin esto, el JOIN se queda sin filas aunque select_profiles
-- ya las permita.
DROP POLICY IF EXISTS select_user_roles ON user_roles;
CREATE POLICY select_user_roles ON user_roles FOR SELECT
  USING (
    user_id = current_user_id()
    OR current_app_role() = 'gerencia'
    OR (
      current_app_role() = 'coordinador'
      AND EXISTS (
        SELECT 1 FROM profiles p
        JOIN profile_sucursales ps ON ps.sucursal_id = p.sucursal_id
        WHERE p.id = user_roles.user_id
          AND ps.profile_id = current_user_id()
      )
    )
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1 FROM profiles p
        JOIN profile_unidades_negocio pun ON pun.unidad_negocio_id = p.unidad_negocio_id
        WHERE p.id = user_roles.user_id
          AND pun.profile_id = current_user_id()
      )
    )
  );

-- gerente_comercial → coordinadores: getDestinatariosDisponiblesAction también
-- lee profile_unidades_negocio de SU PROPIO perfil para resolver sus unidades
-- asignadas; select_profile_unidades_negocio ya cubre profile_id = self, así
-- que no requiere cambio, se deja documentado por completitud.
