-- Seed módulos faltantes en role_module_access (evaluacion apareció después de 0010;
-- sin esta fila el override de UI oculta "Reporte de Cumplimiento" a gerente_comercial).
INSERT INTO role_module_access (role, module, can_view) VALUES
  ('gerencia', 'evaluacion', true),
  ('gerente_comercial', 'evaluacion', true),
  ('coordinador', 'evaluacion', true),
  ('asesor', 'evaluacion', true),
  ('administrador', 'evaluacion', true)
ON CONFLICT (role, module) DO UPDATE SET can_view = EXCLUDED.can_view;

INSERT INTO role_module_access (role, module, can_view) VALUES
  ('gerencia', 'ajustes_manuales', true),
  ('administrador', 'ajustes_manuales', true),
  ('gerente_comercial', 'ajustes_manuales', false),
  ('coordinador', 'ajustes_manuales', false),
  ('asesor', 'ajustes_manuales', false)
ON CONFLICT (role, module) DO UPDATE SET can_view = EXCLUDED.can_view;

INSERT INTO role_module_access (role, module, can_view) VALUES
  ('gerente_comercial', 'carga', false),
  ('gerente_comercial', 'usuarios', false),
  ('gerente_comercial', 'mercadeo', false)
ON CONFLICT (role, module) DO UPDATE SET can_view = EXCLUDED.can_view;
