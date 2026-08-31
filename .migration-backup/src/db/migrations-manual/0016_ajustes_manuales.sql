-- Ajustes manuales de venta/facturado (solo rol gerencia). Tabla fuera del
-- ciclo DELETE+INSERT de la carga automática — ver comentario en schema.ts.
-- Ejecutar con el rol app_admin (BYPASSRLS).

CREATE TABLE ajustes_manuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio integer NOT NULL,
  mes integer NOT NULL,
  sucursal_id uuid REFERENCES sucursales(id),
  unidad_negocio_id uuid REFERENCES unidades_negocio(id),
  monto numeric(14, 2) NOT NULL,
  motivo text NOT NULL,
  creado_por uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ajustes_manuales_anio_mes_idx ON ajustes_manuales (anio, mes);
CREATE INDEX ajustes_manuales_sucursal_id_idx ON ajustes_manuales (sucursal_id);
CREATE INDEX ajustes_manuales_unidad_negocio_id_idx ON ajustes_manuales (unidad_negocio_id);

ALTER TABLE ajustes_manuales ENABLE ROW LEVEL SECURITY;

-- Lectura: mismo scope que presupuestos/facturas (sucursal + unidad del rol).
CREATE POLICY select_ajustes_manuales ON ajustes_manuales FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));

-- Escritura: solo gerencia, sin excepción de scope (es un ajuste global de
-- cualquier sucursal/unidad, no algo que un coordinador o gerente_comercial
-- deba poder tocar).
CREATE POLICY insert_ajustes_manuales_admin_only ON ajustes_manuales FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY update_ajustes_manuales_admin_only ON ajustes_manuales FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_ajustes_manuales_admin_only ON ajustes_manuales FOR DELETE
  USING (current_app_role() = 'gerencia');
