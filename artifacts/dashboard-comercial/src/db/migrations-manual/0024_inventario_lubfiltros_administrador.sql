-- `select_inventario_lubfiltros` y `can_read_row_by_sucursal_texto` se
-- escribieron antes del rol administrador (0018). 0020 igualó administrador
-- a gerencia en can_read_row / can_read_row_by_unidad_only, pero estas dos
-- quedaron con ELSE false: un administrador ve 0 filas de inventario
-- Lub/Filtros (y de equipos_facturacion_sucursal).

CREATE OR REPLACE FUNCTION can_read_row_by_sucursal_texto(_unidad uuid, _sucursal_texto text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
    WHEN current_app_role() = 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN current_app_role() = 'coordinador' THEN EXISTS (
      SELECT 1 FROM sucursales s
      WHERE s.id = current_sucursal_id()
        AND trim(upper(s.nombre)) = trim(upper(_sucursal_texto))
    )
    WHEN current_app_role() = 'asesor' THEN EXISTS (
      SELECT 1 FROM sucursales s
      WHERE s.id = current_sucursal_id()
        AND trim(upper(s.nombre)) = trim(upper(_sucursal_texto))
    )
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS select_inventario_lubfiltros ON inventario_lubfiltros;
CREATE POLICY select_inventario_lubfiltros ON inventario_lubfiltros FOR SELECT
  USING (
    CASE
      WHEN current_app_role() IN ('administrador', 'gerencia') THEN true
      WHEN current_app_role() = 'gerente_comercial' THEN EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun
        JOIN unidades_negocio un ON un.id = pun.unidad_negocio_id
        WHERE pun.profile_id = current_user_id()
          AND un.nombre ILIKE '%lubricante%'
      )
      WHEN current_app_role() IN ('coordinador', 'asesor') THEN EXISTS (
        SELECT 1 FROM sucursales s
        WHERE s.id = current_sucursal_id()
          AND trim(upper(s.nombre)) = trim(upper(sucursal))
      )
      ELSE false
    END
  );
