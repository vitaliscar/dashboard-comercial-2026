-- Copy Gerencia Nacional's module access and assign Director to German Guerra.
-- The backend maps director sessions to the existing national RLS scope while
-- preserving the distinct role in the application for budget field controls.

BEGIN;

INSERT INTO role_module_access (role, module, can_view, can_create, can_edit, can_delete)
SELECT 'director'::app_role, module, can_view, can_create, can_edit, can_delete
FROM role_module_access
WHERE role = 'gerencia'
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  updated_at = now();

DO $$
DECLARE
  director_ids uuid[];
BEGIN
  SELECT array_agg(p.id) INTO director_ids
  FROM profiles p
  WHERE regexp_replace(
    translate(lower(trim(coalesce(p.nombre_completo, ''))), 'áéíóúüñ', 'aeiouun'),
    '\s+', ' ', 'g'
  ) LIKE 'german guerra%';

  IF coalesce(array_length(director_ids, 1), 0) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one profile matching German Guerra; found %',
      coalesce(array_length(director_ids, 1), 0);
  END IF;

  DELETE FROM user_roles WHERE user_id = director_ids[1];

  INSERT INTO user_roles (user_id, role)
  SELECT director_ids[1], 'director'::app_role
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = director_ids[1] AND role = 'director'::app_role
  );
END $$;

COMMIT;
