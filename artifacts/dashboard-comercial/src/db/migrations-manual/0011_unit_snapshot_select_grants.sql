-- Los endpoints HTTP de unidades leen snapshots que no siempre tienen una
-- dimensión de sucursal/asesor. El rol app_user recibe SELECT, pero RLS falla
-- cerrado: snapshots globales solo para gerencia o el gerente de esa unidad;
-- el detalle estratégico de Servicios sí se limita por sucursal/unidad.
GRANT SELECT ON TABLE
  detalles_ventas_repuestos,
  detalles_ventas_lubfiltros,
  inventario_lubfiltros,
  servicios_interno,
  detalles_servicios_estrategicos
TO app_user;

CREATE OR REPLACE FUNCTION can_read_unit_snapshot(_unidad_nombre text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN EXISTS (
      SELECT 1
      FROM profile_unidades_negocio pun
      INNER JOIN unidades_negocio un ON un.id = pun.unidad_negocio_id
      WHERE pun.profile_id = current_user_id()
        AND un.nombre = _unidad_nombre
    )
    ELSE false
  END;
$$;

ALTER TABLE detalles_ventas_repuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_ventas_lubfiltros ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_lubfiltros ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_interno ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_servicios_estrategicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_detalles_ventas_repuestos ON detalles_ventas_repuestos;
CREATE POLICY select_detalles_ventas_repuestos ON detalles_ventas_repuestos FOR SELECT
  USING (can_read_unit_snapshot('Repuestos'));

DROP POLICY IF EXISTS select_detalles_ventas_lubfiltros ON detalles_ventas_lubfiltros;
CREATE POLICY select_detalles_ventas_lubfiltros ON detalles_ventas_lubfiltros FOR SELECT
  USING (can_read_unit_snapshot('Lubricantes/Filtros'));

DROP POLICY IF EXISTS select_inventario_lubfiltros ON inventario_lubfiltros;
CREATE POLICY select_inventario_lubfiltros ON inventario_lubfiltros FOR SELECT
  USING (can_read_unit_snapshot('Lubricantes/Filtros'));

DROP POLICY IF EXISTS select_servicios_interno ON servicios_interno;
CREATE POLICY select_servicios_interno ON servicios_interno FOR SELECT
  USING (can_read_unit_snapshot('Servicios'));

DROP POLICY IF EXISTS select_detalles_servicios_estrategicos ON detalles_servicios_estrategicos;
CREATE POLICY select_detalles_servicios_estrategicos ON detalles_servicios_estrategicos FOR SELECT
  USING (
    can_read_row(
      sucursal_id,
      (SELECT id FROM unidades_negocio WHERE nombre = 'Servicios' LIMIT 1),
      NULL
    )
  );