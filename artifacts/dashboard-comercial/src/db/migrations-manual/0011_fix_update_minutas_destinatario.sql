-- Fix: update_minutas (0008) nunca excluía al propio destinatario, solo al
-- rol asesor — un coordinador destinatario de una minuta de su gerente
-- comercial podía auto-cerrarla (bypass del flujo de coaching jerárquico).
-- Ejecutar con el rol app_admin (BYPASSRLS).

DROP POLICY IF EXISTS update_minutas ON minutas;
CREATE POLICY update_minutas ON minutas FOR UPDATE
  USING (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND destinatario_id <> current_user_id()
  )
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND destinatario_id <> current_user_id()
  );
