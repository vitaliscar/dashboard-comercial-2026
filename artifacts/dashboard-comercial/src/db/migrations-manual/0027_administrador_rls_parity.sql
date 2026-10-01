-- Alinea RLS con los permisos explícitos de administrador de la aplicación.
-- Ejecutar después de 0025 y 0026, con el rol app_admin (BYPASSRLS).

BEGIN;

-- El API permite a Administrador y Gerencia gestionar minutas; Asesoría sigue
-- limitada a leer/comentar las minutas que tiene asignadas.
DROP POLICY IF EXISTS insert_minutas ON minutas;
CREATE POLICY insert_minutas ON minutas FOR INSERT
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND (
      current_app_role() IN ('administrador', 'gerencia')
      OR (
        current_app_role() = 'coordinador'
        AND EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = destinatario_id AND ur.role = 'asesor'
        )
      )
      OR (
        current_app_role() = 'gerente_comercial'
        AND EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = destinatario_id AND ur.role = 'coordinador'
        )
      )
    )
  );

DROP POLICY IF EXISTS delete_minutas ON minutas;
CREATE POLICY delete_minutas ON minutas FOR DELETE
  USING (current_app_role() IN ('administrador', 'gerencia'));

-- Ajustes manuales: Administrador siempre; Gerencia solo con profile.is_admin.
DROP POLICY IF EXISTS insert_ajustes_manuales_admin_only ON ajustes_manuales;
CREATE POLICY insert_ajustes_manuales_admin_only ON ajustes_manuales FOR INSERT
  WITH CHECK (
    current_app_role() = 'administrador'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
    )
  );

DROP POLICY IF EXISTS update_ajustes_manuales_admin_only ON ajustes_manuales;
CREATE POLICY update_ajustes_manuales_admin_only ON ajustes_manuales FOR UPDATE
  USING (
    current_app_role() = 'administrador'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
    )
  )
  WITH CHECK (
    current_app_role() = 'administrador'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
    )
  );

DROP POLICY IF EXISTS delete_ajustes_manuales_admin_only ON ajustes_manuales;
CREATE POLICY delete_ajustes_manuales_admin_only ON ajustes_manuales FOR DELETE
  USING (
    current_app_role() = 'administrador'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
    )
  );

-- El mapa de permisos muestra estos módulos al Administrador. Añadirlo a las
-- políticas SQL para que la lectura no falle detrás del gate de interfaz.
DROP POLICY IF EXISTS select_mercadeo_canales ON mercadeo_canales;
CREATE POLICY select_mercadeo_canales ON mercadeo_canales FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS select_mercadeo_instagram ON mercadeo_instagram;
CREATE POLICY select_mercadeo_instagram ON mercadeo_instagram FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS select_mercadeo_google_business ON mercadeo_google_business;
CREATE POLICY select_mercadeo_google_business ON mercadeo_google_business FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS select_mercadeo_post_historias ON mercadeo_post_historias;
CREATE POLICY select_mercadeo_post_historias ON mercadeo_post_historias FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia'));

DROP POLICY IF EXISTS select_clientes_potenciales ON clientes_potenciales;
CREATE POLICY select_clientes_potenciales ON clientes_potenciales FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia', 'gerente_comercial'));

DROP POLICY IF EXISTS select_comisiones_reglas ON comisiones_reglas;
CREATE POLICY select_comisiones_reglas ON comisiones_reglas FOR SELECT
  USING (current_app_role() IN ('administrador', 'gerencia', 'gerente_comercial', 'coordinador'));

COMMIT;
