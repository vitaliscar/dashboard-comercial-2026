-- Cartera integral cargada desde la asignación comercial 2026.
-- Un cliente tiene una identidad por compañía/código y puede tener varios
-- asesores responsables en sucursales distintas.

BEGIN;

CREATE TABLE IF NOT EXISTS clientes_integrales (
  compania_codigo integer NOT NULL,
  codigo_cliente text NOT NULL,
  nombre text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (compania_codigo, codigo_cliente)
);

CREATE TABLE IF NOT EXISTS cartera_integral (
  compania_codigo integer NOT NULL,
  codigo_cliente text NOT NULL,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  codigo_asesor text NOT NULL,
  asesor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (compania_codigo, codigo_cliente, sucursal_id, codigo_asesor),
  FOREIGN KEY (compania_codigo, codigo_cliente)
    REFERENCES clientes_integrales(compania_codigo, codigo_cliente)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cartera_integral_sucursal_asesor_idx
  ON cartera_integral (sucursal_id, codigo_asesor);
CREATE INDEX IF NOT EXISTS cartera_integral_cliente_idx
  ON cartera_integral (compania_codigo, codigo_cliente);

ALTER TABLE clientes_integrales ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartera_integral ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_cartera_integral ON cartera_integral;
CREATE POLICY select_cartera_integral ON cartera_integral FOR SELECT
  USING (
    can_read_row(sucursal_id, NULL, NULL)
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1 FROM cumplimiento_asesores ca
        WHERE ca.codigo_asesor = cartera_integral.codigo_asesor
          AND ca.sucursal_id = cartera_integral.sucursal_id
          AND can_read_row(ca.sucursal_id, ca.unidad_negocio_id, ca.asesor_id)
      )
    )
    OR (
      current_app_role() = 'asesor'
      AND EXISTS (
        SELECT 1 FROM cumplimiento_asesores ca
        WHERE ca.codigo_asesor = cartera_integral.codigo_asesor
          AND ca.sucursal_id = cartera_integral.sucursal_id
          AND ca.asesor_id = current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS select_clientes_integrales ON clientes_integrales;
CREATE POLICY select_clientes_integrales ON clientes_integrales FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cartera_integral ci
      WHERE ci.compania_codigo = clientes_integrales.compania_codigo
        AND ci.codigo_cliente = clientes_integrales.codigo_cliente
    )
  );

GRANT SELECT ON TABLE clientes_integrales, cartera_integral TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clientes_integrales, cartera_integral TO app_admin;

COMMIT;
