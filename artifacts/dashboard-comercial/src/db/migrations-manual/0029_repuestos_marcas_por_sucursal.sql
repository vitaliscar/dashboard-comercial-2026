-- Add branch attribution to brand sales snapshots without fabricating a
-- branch for historical rows that were imported as consolidated totals.
-- This migration also records the read policies already deployed in Postgres.

BEGIN;

ALTER TABLE detalles_ventas_repuestos
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

ALTER TABLE detalles_ventas_lubfiltros
  ADD COLUMN IF NOT EXISTS sucursal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'detalles_ventas_repuestos_sucursal_id_fkey'
      AND conrelid = 'detalles_ventas_repuestos'::regclass
  ) THEN
    ALTER TABLE detalles_ventas_repuestos
      ADD CONSTRAINT detalles_ventas_repuestos_sucursal_id_fkey
      FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'detalles_ventas_lubfiltros_sucursal_id_fkey'
      AND conrelid = 'detalles_ventas_lubfiltros'::regclass
  ) THEN
    ALTER TABLE detalles_ventas_lubfiltros
      ADD CONSTRAINT detalles_ventas_lubfiltros_sucursal_id_fkey
      FOREIGN KEY (sucursal_id) REFERENCES sucursales(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS detalles_ventas_repuestos_sucursal_id_idx
  ON detalles_ventas_repuestos (sucursal_id);

CREATE INDEX IF NOT EXISTS detalles_ventas_lubfiltros_sucursal_id_idx
  ON detalles_ventas_lubfiltros (sucursal_id);

GRANT SELECT ON TABLE detalles_ventas_repuestos, detalles_ventas_lubfiltros TO app_user;

ALTER TABLE detalles_ventas_repuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_ventas_lubfiltros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_detalles_ventas_repuestos
  ON detalles_ventas_repuestos;
CREATE POLICY select_detalles_ventas_repuestos
  ON detalles_ventas_repuestos FOR SELECT
  USING (
    current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1
        FROM profile_unidades_negocio pun
        JOIN unidades_negocio un ON un.id = pun.unidad_negocio_id
        WHERE pun.profile_id = current_user_id()
          AND un.nombre = 'Repuestos'
      )
    )
    OR (
      current_app_role() = 'coordinador'
      AND sucursal_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id()
          AND ps.sucursal_id = detalles_ventas_repuestos.sucursal_id
      )
    )
  );

DROP POLICY IF EXISTS select_detalles_ventas_lubfiltros
  ON detalles_ventas_lubfiltros;
CREATE POLICY select_detalles_ventas_lubfiltros
  ON detalles_ventas_lubfiltros FOR SELECT
  USING (
    current_app_role() IN ('administrador', 'gerencia')
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1
        FROM profile_unidades_negocio pun
        JOIN unidades_negocio un ON un.id = pun.unidad_negocio_id
        WHERE pun.profile_id = current_user_id()
          AND un.nombre = 'Lubricantes/Filtros'
      )
    )
    OR (
      current_app_role() = 'coordinador'
      AND sucursal_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id()
          AND ps.sucursal_id = detalles_ventas_lubfiltros.sucursal_id
      )
    )
  );

COMMIT;
