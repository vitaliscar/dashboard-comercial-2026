-- A qué columna de `presupuestos` se suma cada ajuste. "total" (default,
-- retrocompatible) afecta el total combinado sin tocar el desglose; usar
-- "ccv"/"xibi"/"estrategico" para reclasificar plata entre columnas (dos
-- filas con signo opuesto y mismo total neto).
-- Ejecutar con el rol app_admin (BYPASSRLS). Ya aplicada en la BD compartida
-- entre Next.js y Vite -- este archivo documenta el cambio en el repo Vite.

ALTER TABLE ajustes_manuales ADD COLUMN IF NOT EXISTS columna text NOT NULL DEFAULT 'total';

ALTER TABLE ajustes_manuales DROP CONSTRAINT IF EXISTS ajustes_manuales_columna_check;
ALTER TABLE ajustes_manuales ADD CONSTRAINT ajustes_manuales_columna_check
  CHECK (columna IN ('ccv', 'xibi', 'estrategico', 'total'));
