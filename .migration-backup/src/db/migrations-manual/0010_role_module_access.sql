-- Config de visibilidad de módulos por rol (reemplaza MODULE_ACCESS estático
-- de src/lib/permissions.ts como fuente de verdad en runtime, editable desde
-- /usuarios). Semántica: ausencia de fila = sin acceso (deny by default,
-- mismo comportamiento que el objeto estático que reemplaza).
-- Scope de datos (sucursal/unidad/asesor) sigue siendo RLS pura, intacta.
-- Ejecutar con el rol app_admin (BYPASSRLS).

CREATE TABLE "role_module_access" (
	"role" "app_role" NOT NULL,
	"module" text NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("role", "module")
);

-- Seed: snapshot 1:1 del MODULE_ACCESS estático actual.
INSERT INTO role_module_access (role, module, can_view) VALUES
  ('gerencia', 'resumen', true), ('gerente_comercial', 'resumen', true), ('coordinador', 'resumen', true), ('asesor', 'resumen', true),
  ('gerencia', 'dashboard', true), ('gerente_comercial', 'dashboard', true), ('coordinador', 'dashboard', true), ('asesor', 'dashboard', true),
  ('gerencia', 'minutas', true), ('gerente_comercial', 'minutas', true), ('coordinador', 'minutas', true), ('asesor', 'minutas', true),
  ('gerencia', 'cobranzas', true), ('gerente_comercial', 'cobranzas', true), ('coordinador', 'cobranzas', true),
  ('gerencia', 'pareto', true), ('gerente_comercial', 'pareto', true),
  ('gerencia', 'asesores', true), ('gerente_comercial', 'asesores', true), ('coordinador', 'asesores', true),
  ('gerencia', 'alertas', true), ('gerente_comercial', 'alertas', true), ('coordinador', 'alertas', true), ('asesor', 'alertas', true),
  ('gerencia', 'embudo', true), ('gerente_comercial', 'embudo', true),
  ('gerencia', 'mercadeo', true),
  ('gerencia', 'carga', true),
  ('gerencia', 'usuarios', true),
  ('gerencia', 'gerencia_nacional', true), ('gerente_comercial', 'gerencia_nacional', true),
  ('coordinador', 'coordinador', true),
  ('asesor', 'asesor', true),
  ('gerencia', 'servicios', true), ('gerente_comercial', 'servicios', true), ('coordinador', 'servicios', true),
  ('gerencia', 'lubfiltros', true), ('gerente_comercial', 'lubfiltros', true), ('coordinador', 'lubfiltros', true),
  ('gerencia', 'equipos', true), ('gerente_comercial', 'equipos', true), ('coordinador', 'equipos', true),
  ('gerencia', 'alquiler', true), ('gerente_comercial', 'alquiler', true), ('coordinador', 'alquiler', true),
  ('coordinador', 'sucursal', true),
  ('gerencia', 'repuestos', true), ('gerente_comercial', 'repuestos', true), ('coordinador', 'repuestos', true),
  ('gerencia', 'cliente_360', true), ('gerente_comercial', 'cliente_360', true), ('coordinador', 'cliente_360', true), ('asesor', 'cliente_360', true),
  ('gerencia', 'comisiones', true), ('gerente_comercial', 'comisiones', true), ('coordinador', 'comisiones', true),
  ('gerencia', 'simulador', true), ('gerente_comercial', 'simulador', true);

ALTER TABLE role_module_access ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado necesita leer la matriz completa para armar
-- su propio nav (no es sensible: son solo llaves module/role, no datos).
CREATE POLICY select_role_module_access ON role_module_access FOR SELECT
  USING (current_app_role() IS NOT NULL);
CREATE POLICY insert_role_module_access_admin_only ON role_module_access FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY update_role_module_access_admin_only ON role_module_access FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_role_module_access_admin_only ON role_module_access FOR DELETE
  USING (current_app_role() = 'gerencia');
