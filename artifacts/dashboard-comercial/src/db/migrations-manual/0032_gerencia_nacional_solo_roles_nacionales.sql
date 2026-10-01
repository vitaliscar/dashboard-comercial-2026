-- La vista nacional corresponde a Administrador y Gerencia Nacional.
-- El override dinámico no debe habilitarla para Gerente Comercial.
-- Ejecutar manualmente con app_admin (BYPASSRLS).

BEGIN;

UPDATE role_module_access
SET can_view = false,
    updated_at = now()
WHERE role = 'gerente_comercial'
  AND module = 'gerencia_nacional';

COMMIT;
