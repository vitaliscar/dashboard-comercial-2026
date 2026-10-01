-- El rol administrador tiene acceso global en la aplicación, pero la política
-- original de snapshots (0011) solo incluyó a gerencia y gerente comercial.
-- Mantiene el filtro de unidad para gerente comercial y deniega los demás roles.

BEGIN;

CREATE OR REPLACE FUNCTION can_read_unit_snapshot(_unidad_nombre text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'administrador' THEN true
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

COMMIT;
