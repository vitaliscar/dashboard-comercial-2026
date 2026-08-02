-- RLS del módulo Mercadeo.
-- Las 4 tablas de métricas de marketing solo las ve gerencia: gate de un solo
-- nivel por rol, sin scope por sucursal/unidad.
ALTER TABLE mercadeo_canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_instagram ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_google_business ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_post_historias ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_mercadeo_canales ON mercadeo_canales FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_instagram ON mercadeo_instagram FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_google_business ON mercadeo_google_business FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_post_historias ON mercadeo_post_historias FOR SELECT
  USING (current_app_role() = 'gerencia');

-- clientes_potenciales: gerencia + gerente_comercial. NO se filtra por unidad
-- a nivel de RLS porque tipo_negocio es texto libre y no hay FK contra la cual
-- comparar con can_read_row (mismo caso documentado que
-- equipos_facturacion_sucursal). El acotado por unidad para gerente_comercial
-- lo hace el server action (src/lib/actions/mercadeo.ts).
ALTER TABLE clientes_potenciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_clientes_potenciales ON clientes_potenciales FOR SELECT
  USING (current_app_role() IN ('gerencia', 'gerente_comercial'));
