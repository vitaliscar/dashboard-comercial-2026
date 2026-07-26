-- Permitir NULL en unidad_negocio_id para cargar datos del Excel
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_unidad_negocio_id_fkey;
ALTER TABLE cotizaciones ALTER COLUMN unidad_negocio_id DROP NOT NULL;
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_unidad_negocio_id_fkey
  FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id);

ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_unidad_negocio_id_fkey;
ALTER TABLE facturas ALTER COLUMN unidad_negocio_id DROP NOT NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_unidad_negocio_id_fkey
  FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id);

ALTER TABLE ventas_perdidas DROP CONSTRAINT IF EXISTS ventas_perdidas_unidad_negocio_id_fkey;
ALTER TABLE ventas_perdidas ALTER COLUMN unidad_negocio_id DROP NOT NULL;
ALTER TABLE ventas_perdidas ADD CONSTRAINT ventas_perdidas_unidad_negocio_id_fkey
  FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id);
