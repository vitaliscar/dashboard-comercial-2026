-- Identidad transaccional para conciliar la cartera por código de cliente,
-- sucursal y asesor sin depender del nombre visible.
BEGIN;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS codigo_cliente text;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS codigo_asesor text;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS codigo_cliente text;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS codigo_asesor text;

CREATE INDEX IF NOT EXISTS facturas_cliente_sucursal_fecha_idx
  ON facturas (codigo_cliente, sucursal_id, fecha);
CREATE INDEX IF NOT EXISTS servicios_cliente_sucursal_fecha_idx
  ON servicios (codigo_cliente, sucursal_id, fecha);

-- Los asesores se autorizan por código comercial + sucursal. Esto permite
-- consultar ventas propias aunque el loader histórico no tenga asesor_id.
CREATE OR REPLACE FUNCTION servicio_cartera_tiene_asesor_unico(
  _compania integer, _codigo_cliente text, _sucursal uuid, _asesor uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cartera_integral ci
    JOIN cumplimiento_asesores ca
      ON ca.codigo_asesor = ci.codigo_asesor
     AND ca.sucursal_id = ci.sucursal_id
    WHERE ci.compania_codigo = _compania
      AND ci.codigo_cliente = _codigo_cliente
      AND ci.sucursal_id = _sucursal
      AND ca.asesor_id = _asesor
  )
  AND (
    SELECT COUNT(DISTINCT ci.codigo_asesor)
    FROM cartera_integral ci
    WHERE ci.compania_codigo = _compania
      AND ci.codigo_cliente = _codigo_cliente
      AND ci.sucursal_id = _sucursal
  ) = 1;
$$;
GRANT EXECUTE ON FUNCTION servicio_cartera_tiene_asesor_unico(integer, text, uuid, uuid) TO app_user;

DROP POLICY IF EXISTS select_facturas ON facturas;
CREATE POLICY select_facturas ON facturas FOR SELECT
  USING (
    can_read_row(sucursal_id, unidad_negocio_id, asesor_id)
    OR (
      current_app_role() = 'asesor'
      AND codigo_asesor IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM cumplimiento_asesores ca
        WHERE ca.codigo_asesor = facturas.codigo_asesor
          AND ca.asesor_id = current_user_id()
          AND ca.sucursal_id = facturas.sucursal_id
      )
    )
  );

DROP POLICY IF EXISTS select_servicios ON servicios;
CREATE POLICY select_servicios ON servicios FOR SELECT
  USING (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    OR (
      current_app_role() = 'asesor'
      AND codigo_asesor IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM cumplimiento_asesores ca
        WHERE ca.codigo_asesor = servicios.codigo_asesor
          AND ca.asesor_id = current_user_id()
          AND ca.sucursal_id = servicios.sucursal_id
      )
    )
    OR (
      current_app_role() = 'asesor'
      AND codigo_asesor IS NULL
      AND codigo_cliente IS NOT NULL
      AND servicio_cartera_tiene_asesor_unico(32, servicios.codigo_cliente, servicios.sucursal_id, current_user_id())
    )
  );

COMMIT;
