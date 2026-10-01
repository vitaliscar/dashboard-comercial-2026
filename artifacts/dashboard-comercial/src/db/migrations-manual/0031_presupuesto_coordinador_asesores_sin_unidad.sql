-- Permite a coordinacion distribuir el presupuesto por asesor aunque el
-- perfil del asesor no tenga unidad asignada. En ese caso, su roster toma
-- infiere las unidades desde ventas historicas reales del asesor dentro de la
-- sucursal; nunca debe incluirlo automaticamente en todas las unidades. Las
-- asignaciones explicitas de unidad siguen teniendo prioridad.
-- Ejecutar manualmente con app_admin (BYPASSRLS).

BEGIN;

CREATE OR REPLACE FUNCTION coordinator_branch_unit_advisors(_branches uuid[])
RETURNS TABLE (asesor_id uuid, sucursal_id uuid, unidad_negocio_id uuid, asesor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH assigned_branches AS (
    SELECT profile_id, sucursal_id FROM profile_sucursales
    UNION
    SELECT p.id, p.sucursal_id FROM profiles p
    WHERE p.sucursal_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_sucursales ps WHERE ps.profile_id = p.id
      )
  ), assigned_units AS (
    SELECT profile_id, unidad_negocio_id FROM profile_unidades_negocio
    UNION
    SELECT p.id, p.unidad_negocio_id FROM profiles p
    WHERE p.unidad_negocio_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun WHERE pun.profile_id = p.id
      )
  ), advisor_units AS (
    SELECT branch.profile_id, branch.sucursal_id, unit.unidad_negocio_id
    FROM assigned_branches branch
    JOIN assigned_units unit ON unit.profile_id = branch.profile_id
    UNION
    SELECT branch.profile_id, branch.sucursal_id, history.unidad_negocio_id
    FROM assigned_branches branch
    JOIN profiles p ON p.id = branch.profile_id
    JOIN users u ON u.id = p.id AND u.is_active = true
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'asesor'
    JOIN cumplimiento_asesores history
      ON history.asesor_id = branch.profile_id
      AND history.sucursal_id = branch.sucursal_id
      AND history.unidad_negocio_id IS NOT NULL
    JOIN presupuestos budget ON budget.sucursal_id = branch.sucursal_id
      AND budget.unidad_negocio_id = history.unidad_negocio_id
    WHERE NOT EXISTS (
      SELECT 1 FROM assigned_units unit WHERE unit.profile_id = branch.profile_id
    )
  )
  SELECT DISTINCT p.id, advisor_unit.sucursal_id,
         advisor_unit.unidad_negocio_id, p.nombre_completo
  FROM advisor_units advisor_unit
  JOIN profiles p ON p.id = advisor_unit.profile_id
  JOIN users u ON u.id = p.id AND u.is_active = true
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'asesor'
  WHERE current_app_role() = 'coordinador'
    AND advisor_unit.sucursal_id = ANY(_branches)
    AND can_read_row(advisor_unit.sucursal_id, advisor_unit.unidad_negocio_id, p.id)
$$;

REVOKE ALL ON FUNCTION coordinator_branch_unit_advisors(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coordinator_branch_unit_advisors(uuid[]) TO app_user;

COMMIT;
