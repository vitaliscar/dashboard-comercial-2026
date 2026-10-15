-- Conserva el número de servicio de la columna S del reporte diario.
-- Permite rastrear la clasificación externa (Tipo = 4, columna Q) por orden.
ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS numero_servicio text;

CREATE INDEX IF NOT EXISTS servicios_numero_servicio_fecha_idx
  ON servicios (numero_servicio, fecha)
  WHERE numero_servicio IS NOT NULL;
