-- RLS para cobranzas_snapshots (acumulado semanal de cobranzas antes de cada carga).
-- Mismo patrón que select_cobranzas: scope por sucursal + unidad, sin asesor_id.
ALTER TABLE cobranzas_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_cobranzas_snapshots ON cobranzas_snapshots FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
