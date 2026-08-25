-- CN-029: comisiones_reglas ya no es SELECT para cualquier rol autenticado.
-- Solo gerencia / gerente_comercial / coordinador (alineado con MODULE_ACCESS).
DROP POLICY IF EXISTS select_comisiones_reglas ON comisiones_reglas;
CREATE POLICY select_comisiones_reglas ON comisiones_reglas FOR SELECT
  USING (current_app_role() IN ('gerencia', 'gerente_comercial', 'coordinador'));
