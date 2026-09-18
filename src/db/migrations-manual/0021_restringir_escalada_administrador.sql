-- Solo un administrador puede otorgar/quitar el rol administrador o activar
-- profiles.is_admin. Antes gerencia podia autopromoverse (revision de seguridad
-- 2026-09-18). Defensa en profundidad: la accion del servidor ya lo valida; esto
-- lo hace cumplir la base de datos. Las conexiones sin rol de app (dbAdmin/ETL,
-- current_app_role() IS NULL) quedan fuera de estas barreras, como siempre.

-- user_roles: gerencia solo inserta/borra filas que NO sean administrador.
DROP POLICY IF EXISTS insert_user_roles_admin_only ON user_roles;
CREATE POLICY insert_user_roles_admin_only ON user_roles FOR INSERT
  WITH CHECK (
    current_app_role() = 'administrador'
    OR (current_app_role() = 'gerencia' AND role <> 'administrador')
  );

DROP POLICY IF EXISTS delete_user_roles_admin_only ON user_roles;
CREATE POLICY delete_user_roles_admin_only ON user_roles FOR DELETE
  USING (
    current_app_role() = 'administrador'
    OR (current_app_role() = 'gerencia' AND role <> 'administrador')
  );

-- profiles.is_admin: RLS no ve el valor anterior, asi que se protege con trigger.
CREATE OR REPLACE FUNCTION guard_profiles_is_admin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_admin AND NOT OLD.is_admin
     AND current_app_role() IS NOT NULL
     AND current_app_role() <> 'administrador' THEN
    RAISE EXCEPTION 'Solo un administrador puede activar is_admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_is_admin ON profiles;
CREATE TRIGGER profiles_guard_is_admin
  BEFORE UPDATE OF is_admin ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profiles_is_admin();
