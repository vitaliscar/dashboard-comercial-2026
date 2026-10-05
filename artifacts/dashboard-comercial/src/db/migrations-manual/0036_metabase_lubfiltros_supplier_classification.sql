-- Keep the Metabase Lubricants/Filters inventory view aligned with the
-- supplier-code classification used by the Dashboard Comercial unit view.
-- CO is Chronus/Lubricantes; DN, D1, GF and NC are Donaldson/Filtros.
BEGIN;

CREATE OR REPLACE VIEW public.v_mb_lubfiltros_inventario AS
SELECT
  CASE
    WHEN upper(trim(i.proveedor_codigo)) = 'CO' THEN 'Lubricantes'
    WHEN upper(trim(i.proveedor_codigo)) IN ('DN', 'D1', 'GF', 'NC') THEN 'Filtros'
    ELSE i.tipo
  END AS tipo,
  i.proveedor_codigo,
  CASE
    WHEN upper(trim(i.proveedor_codigo)) = 'CO' THEN 'Chronus'
    WHEN upper(trim(i.proveedor_codigo)) IN ('DN', 'D1', 'GF', 'NC') THEN 'Donaldson'
    ELSE i.proveedor_codigo
  END AS proveedor_nombre,
  i.sucursal,
  i.monto
FROM public.inventario_lubfiltros AS i;

COMMIT;
