-- Distribución por asesor de las metas oficiales por sucursal/unidad/mes.
-- No reemplaza ni modifica presupuestos ni cumplimiento_asesores.
-- Ejecutar con app_admin (BYPASSRLS).

BEGIN;

-- Administrador y Gerencia conservan acceso total; el resto se limita a las
-- asignaciones que carga la sesión. Coordinación admite sucursales múltiples
-- y Gerencia Comercial conserva compatibilidad con su unidad legacy.
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

CREATE TABLE presupuestos_asesores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  unidad_negocio_id uuid NOT NULL REFERENCES unidades_negocio(id) ON DELETE CASCADE,
  asesor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  codigo_asesor text,
  asesor_nombre text NOT NULL,
  participacion numeric(8, 5) NOT NULL CHECK (participacion BETWEEN 0 AND 100),
  monto numeric(14, 2) NOT NULL CHECK (monto >= 0),
  actualizado_por uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presupuestos_asesores_periodo_asesor_unique
    UNIQUE (anio, mes, sucursal_id, unidad_negocio_id, asesor_id)
);

CREATE INDEX presupuestos_asesores_scope_idx
  ON presupuestos_asesores (anio, sucursal_id, unidad_negocio_id, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE presupuestos_asesores TO app_user;

-- Devuelve solo la identidad mínima de asesores activos asignados a las
-- sucursales del coordinador. Evita abrir lectura general de perfiles/roles.
CREATE OR REPLACE FUNCTION coordinator_branch_unit_advisors(_branches uuid[])
RETURNS TABLE (asesor_id uuid, sucursal_id uuid, unidad_negocio_id uuid, asesor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH assigned_branches AS (
    SELECT profile_id, sucursal_id FROM profile_sucursales
    UNION
    SELECT p.id, p.sucursal_id FROM profiles p
    WHERE p.sucursal_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profile_sucursales ps WHERE ps.profile_id = p.id)
  ), assigned_units AS (
    SELECT profile_id, unidad_negocio_id FROM profile_unidades_negocio
    UNION
    SELECT p.id, p.unidad_negocio_id FROM profiles p
    WHERE p.unidad_negocio_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profile_unidades_negocio pun WHERE pun.profile_id = p.id)
  )
  SELECT DISTINCT p.id, branch.sucursal_id, unit.unidad_negocio_id, p.nombre_completo
  FROM assigned_branches branch
  JOIN profiles p ON p.id = branch.profile_id
  JOIN assigned_units unit ON unit.profile_id = p.id
  JOIN users u ON u.id = p.id AND u.is_active = true
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'asesor'
  WHERE current_app_role() = 'coordinador'
    AND branch.sucursal_id = ANY(_branches)
    AND can_read_row(branch.sucursal_id, unit.unidad_negocio_id, p.id)
$$;

REVOKE ALL ON FUNCTION coordinator_branch_unit_advisors(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coordinator_branch_unit_advisors(uuid[]) TO app_user;

ALTER TABLE presupuestos_asesores ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_presupuestos_asesores ON presupuestos_asesores FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));

CREATE POLICY insert_presupuestos_asesores_coordinador ON presupuestos_asesores FOR INSERT
  WITH CHECK (
    current_app_role() = 'coordinador'
    AND can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND EXISTS (
      SELECT 1 FROM coordinator_branch_unit_advisors(ARRAY[presupuestos_asesores.sucursal_id]) advisor
      WHERE advisor.asesor_id = presupuestos_asesores.asesor_id
        AND advisor.unidad_negocio_id = presupuestos_asesores.unidad_negocio_id
    )
  );

CREATE POLICY update_presupuestos_asesores_coordinador ON presupuestos_asesores FOR UPDATE
  USING (current_app_role() = 'coordinador' AND can_read_row(sucursal_id, unidad_negocio_id, NULL))
  WITH CHECK (
    current_app_role() = 'coordinador'
    AND can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND EXISTS (
      SELECT 1 FROM coordinator_branch_unit_advisors(ARRAY[presupuestos_asesores.sucursal_id]) advisor
      WHERE advisor.asesor_id = presupuestos_asesores.asesor_id
        AND advisor.unidad_negocio_id = presupuestos_asesores.unidad_negocio_id
    )
  );

CREATE POLICY delete_presupuestos_asesores_coordinador ON presupuestos_asesores FOR DELETE
  USING (current_app_role() = 'coordinador' AND can_read_row(sucursal_id, unidad_negocio_id, NULL));

-- La UI de presupuesto del coordinador distribuye lo que ya aprobó Gerencia.
INSERT INTO role_module_access (role, module, can_view) VALUES ('coordinador', 'presupuestos', true)
ON CONFLICT (role, module) DO UPDATE SET can_view = true, updated_at = now();

COMMIT;
