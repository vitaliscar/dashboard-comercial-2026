-- 0001_rls_policies.sql solo definió SELECT/INSERT para profiles/users/user_roles
-- (comentario: "única tabla con UI de escritura hoy" era minutas). La UI de
-- /usuarios sí escribe sobre estas tablas (setUserRoleAction, setProfileSucursalAction,
-- setProfileAdminAction, toggleProfileUnidadAction) pero sin policy de UPDATE/DELETE
-- esas queries corren como app_user (sin BYPASSRLS) y no matchean ninguna fila —
-- silent no-op, confirmado con `UPDATE profiles ...` devolviendo "UPDATE 0" bajo
-- SET LOCAL app.current_role='gerencia'. Cierra ese gap y habilita además el CRUD
-- completo (alta, borrado, reset de password, activar/desactivar) de /usuarios.
-- Ejecutar con el rol app_admin (BYPASSRLS).

CREATE POLICY update_profiles_admin_only ON profiles FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profiles_admin_only ON profiles FOR DELETE
  USING (current_app_role() = 'gerencia');

CREATE POLICY update_users_admin_only ON users FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_users_admin_only ON users FOR DELETE
  USING (current_app_role() = 'gerencia');

CREATE POLICY delete_user_roles_admin_only ON user_roles FOR DELETE
  USING (current_app_role() = 'gerencia');

CREATE POLICY insert_profile_unidades_negocio_admin_only ON profile_unidades_negocio FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profile_unidades_negocio_admin_only ON profile_unidades_negocio FOR DELETE
  USING (current_app_role() = 'gerencia');

-- FK cascade (users -> sessions ON DELETE CASCADE) corre bajo el mismo rol que
-- dispara el DELETE; sin policy de DELETE en sessions, borrar un usuario con
-- sesiones activas fallaría a mitad de la cascada.
CREATE POLICY delete_sessions_own_or_admin ON sessions FOR DELETE
  USING (user_id = current_user_id() OR current_app_role() = 'gerencia');
