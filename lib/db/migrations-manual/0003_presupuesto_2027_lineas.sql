-- Granularidad canal para versiones calculadas por la metodología de presupuesto 2027.
ALTER TABLE presupuestos_versiones_lineas
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS peso numeric(12, 10),
  ADD COLUMN IF NOT EXISTS indice_estacional numeric(12, 10);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'presupuestos_versiones_lineas_canal_check'
  ) THEN
    ALTER TABLE presupuestos_versiones_lineas
      ADD CONSTRAINT presupuestos_versiones_lineas_canal_check
      CHECK (canal IS NULL OR canal IN ('ccv', 'xibi', 'estrategicas'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS presupuestos_versiones_lineas_version_canal_idx
  ON presupuestos_versiones_lineas (version_id, unidad_negocio_id, sucursal_id, mes, canal);
