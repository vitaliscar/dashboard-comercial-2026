-- RLS para ventas_casa (hoja Excel "Ventas Casa": Sucursal/U-N/Mes, sin
-- asesor asociado). Mismo patrón que select_servicios/select_cobranzas:
-- scope por sucursal + unidad, sin asesor_id (no aplica, no hay asesor).
ALTER TABLE ventas_casa ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_ventas_casa ON ventas_casa FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
