-- Conserva el identificador Q del reporte de Servicios para clasificar ventas
-- externas (tipo 4) sin reutilizar categoria_venta, que representa Tipo Cliente.
ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS tipo_venta_reporte integer;
