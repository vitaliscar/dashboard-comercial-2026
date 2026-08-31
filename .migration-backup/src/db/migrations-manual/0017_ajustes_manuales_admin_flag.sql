-- Ajustes manuales: la escritura debe exigir profiles.is_admin, no solo
-- role='gerencia' — hoy coinciden para el único usuario admin, pero en el
-- futuro puede haber más de un usuario con rol gerencia que NO deba tocar
-- ajustes manuales (solo el administrador real de la aplicación).
-- Ejecutar con el rol app_admin (BYPASSRLS).

DROP POLICY IF EXISTS insert_ajustes_manuales_admin_only ON ajustes_manuales;
DROP POLICY IF EXISTS update_ajustes_manuales_admin_only ON ajustes_manuales;
DROP POLICY IF EXISTS delete_ajustes_manuales_admin_only ON ajustes_manuales;

CREATE POLICY insert_ajustes_manuales_admin_only ON ajustes_manuales FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin));
CREATE POLICY update_ajustes_manuales_admin_only ON ajustes_manuales FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin));
CREATE POLICY delete_ajustes_manuales_admin_only ON ajustes_manuales FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin));
