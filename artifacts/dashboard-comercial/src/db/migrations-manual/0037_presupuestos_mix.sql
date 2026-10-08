BEGIN;

CREATE TABLE IF NOT EXISTS presupuestos_mix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES presupuestos_versiones(id) ON DELETE CASCADE,
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  nivel text NOT NULL CHECK (nivel IN ('unidad', 'sucursal_mes', 'asesor_mes')),
  unidad_negocio_id uuid NOT NULL REFERENCES unidades_negocio(id),
  sucursal_id uuid REFERENCES sucursales(id),
  mes integer CHECK (mes BETWEEN 1 AND 12),
  asesor_id uuid REFERENCES profiles(id),
  item_key text NOT NULL,
  participacion numeric(9,5) NOT NULL CHECK (participacion BETWEEN 0 AND 100),
  monto numeric(16,2) NOT NULL CHECK (monto >= 0),
  actualizado_por uuid NOT NULL REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (nivel = 'unidad' AND sucursal_id IS NULL AND mes IS NULL AND asesor_id IS NULL)
    OR (nivel = 'sucursal_mes' AND sucursal_id IS NOT NULL AND mes IS NOT NULL AND asesor_id IS NULL)
    OR (nivel = 'asesor_mes' AND sucursal_id IS NOT NULL AND mes IS NOT NULL AND asesor_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS presupuestos_mix_scope_item_uidx
  ON presupuestos_mix (
    version_id, nivel, unidad_negocio_id,
    COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(mes, 0),
    COALESCE(asesor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    item_key
  );
CREATE INDEX IF NOT EXISTS presupuestos_mix_scope_idx
  ON presupuestos_mix (version_id, anio, unidad_negocio_id, sucursal_id, mes, asesor_id);

ALTER TABLE presupuestos_mix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuestos_mix_select ON presupuestos_mix;
CREATE POLICY presupuestos_mix_select ON presupuestos_mix FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
DROP POLICY IF EXISTS presupuestos_mix_write ON presupuestos_mix;
CREATE POLICY presupuestos_mix_write ON presupuestos_mix FOR ALL
  USING (
    can_read_row(sucursal_id, unidad_negocio_id, asesor_id)
    AND (
      current_app_role() = 'administrador'
      OR (current_app_role() = 'gerencia' AND nivel = 'unidad')
      OR (current_app_role() = 'gerente_comercial' AND nivel = 'sucursal_mes')
      OR (current_app_role() = 'coordinador' AND nivel = 'asesor_mes')
    )
  )
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, asesor_id)
    AND (
      current_app_role() = 'administrador'
      OR (current_app_role() = 'gerencia' AND nivel = 'unidad')
      OR (current_app_role() = 'gerente_comercial' AND nivel = 'sucursal_mes')
      OR (current_app_role() = 'coordinador' AND nivel = 'asesor_mes')
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON presupuestos_mix TO app_user;

COMMIT;
