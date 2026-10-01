-- 0025_presupuestos_asesores reemplazó can_read_row y omitió el rol
-- administrador, que 0020 define con acceso total. Restaura ese permiso sin
-- cambiar los scopes de Gerencia Comercial, Coordinación o Asesoría.
-- Si 0025 está pendiente, esa versión ya incorpora la corrección; aplica esta
-- migración cuando 0025 ya se ejecutó y no se volverá a ejecutar.

BEGIN;

CREATE OR REPLACE FUNCTION can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
    WHEN current_app_role() = 'gerente_comercial' THEN _unidad IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun
        WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
      ) OR (
        NOT EXISTS (SELECT 1 FROM profile_unidades_negocio pun WHERE pun.profile_id = current_user_id())
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = current_user_id() AND p.unidad_negocio_id = _unidad
        )
      )
    )
    WHEN current_app_role() = 'coordinador' THEN _sucursal IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id() AND ps.sucursal_id = _sucursal
      ) OR (
        NOT EXISTS (SELECT 1 FROM profile_sucursales ps WHERE ps.profile_id = current_user_id())
        AND _sucursal = current_sucursal_id()
      )
    )
    WHEN current_app_role() = 'asesor' THEN _asesor IS NOT NULL AND _asesor = current_user_id()
    ELSE false
  END;
$$;

COMMIT;
