-- Dos brechas de RLS encontradas por auditoría externa (Replit) y confirmadas
-- contra el código real:
--
-- 1) equipos_facturacion_sucursal: can_read_row_by_unidad_only() daba `true`
--    incondicional para coordinador Y asesor (sin comparar unidad ni
--    sucursal) — veían facturación de Equipos de CUALQUIER sucursal.
--
-- 2) inventario_lubfiltros: RLS nunca se habilitó en esta tabla — cualquier
--    rol que la consulte (lubfiltros.ts sí lo hace) ve inventario de TODAS
--    las sucursales sin ningún filtro.
--
-- Regla de negocio confirmada con el usuario: en ambas tablas, coordinador Y
-- asesor ven todas las unidades pero SOLO de su propia sucursal (no hay
-- columna de asesor en ninguna de las dos, así que ambos roles comparten el
-- mismo alcance aquí). `sucursal` es texto libre (viene del Excel/AS400, con
-- relleno de espacios) — se compara contra sucursales.nombre con trim()+upper()
-- porque no hay FK confiable (drift documentado en docs/SCHEMA.md).
--
-- Ejecutar con el rol app_admin (BYPASSRLS).

CREATE OR REPLACE FUNCTION can_read_row_by_sucursal_texto(_unidad uuid, _sucursal_texto text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN EXISTS (
      SELECT 1 FROM sucursales s
      WHERE s.id = current_sucursal_id()
        AND trim(upper(s.nombre)) = trim(upper(_sucursal_texto))
    )
    WHEN 'asesor' THEN EXISTS (
      SELECT 1 FROM sucursales s
      WHERE s.id = current_sucursal_id()
        AND trim(upper(s.nombre)) = trim(upper(_sucursal_texto))
    )
    ELSE false
  END;
$$;

-- 1) equipos_facturacion_sucursal: reemplazar la policy existente.
DROP POLICY IF EXISTS select_equipos_facturacion_sucursal ON equipos_facturacion_sucursal;
CREATE POLICY select_equipos_facturacion_sucursal ON equipos_facturacion_sucursal FOR SELECT
  USING (can_read_row_by_sucursal_texto(unidad_negocio_id, sucursal));

-- 2) inventario_lubfiltros: nunca tuvo RLS — habilitarlo ahora.
-- Esta tabla no tiene unidad_negocio_id (es fija a Lub/Filtros): para
-- gerente_comercial se resuelve el id de esa unidad por nombre y se compara
-- contra profile_unidades_negocio, igual criterio que las demás tablas.
ALTER TABLE inventario_lubfiltros ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_inventario_lubfiltros ON inventario_lubfiltros FOR SELECT
  USING (
    CASE current_app_role()
      WHEN 'gerencia' THEN true
      WHEN 'gerente_comercial' THEN EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun
        JOIN unidades_negocio un ON un.id = pun.unidad_negocio_id
        WHERE pun.profile_id = current_user_id()
          AND un.nombre ILIKE '%lubricante%'
      )
      WHEN 'coordinador' THEN EXISTS (
        SELECT 1 FROM sucursales s
        WHERE s.id = current_sucursal_id()
          AND trim(upper(s.nombre)) = trim(upper(sucursal))
      )
      WHEN 'asesor' THEN EXISTS (
        SELECT 1 FROM sucursales s
        WHERE s.id = current_sucursal_id()
          AND trim(upper(s.nombre)) = trim(upper(sucursal))
      )
      ELSE false
    END
  );
