CREATE TYPE presupuesto_escenario AS ENUM ('conservador', 'base', 'optimista');
CREATE TYPE presupuesto_estado AS ENUM ('borrador', 'propuesto', 'aprobado', 'archivado');
CREATE TABLE IF NOT EXISTS presupuestos_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), anio integer NOT NULL, nombre text NOT NULL,
  escenario presupuesto_escenario NOT NULL DEFAULT 'base', estado presupuesto_estado NOT NULL DEFAULT 'borrador',
  descripcion text, premisas jsonb NOT NULL DEFAULT '{}'::jsonb, creado_por uuid REFERENCES users(id), aprobado_por uuid REFERENCES users(id), aprobado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presupuestos_versiones_anio_idx ON presupuestos_versiones (anio);
CREATE TABLE IF NOT EXISTS presupuestos_versiones_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES presupuestos_versiones(id) ON DELETE CASCADE,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12), sucursal_id uuid REFERENCES sucursales(id), unidad_negocio_id uuid REFERENCES unidades_negocio(id),
  historico numeric(14,2) NOT NULL DEFAULT 0, sugerido numeric(14,2) NOT NULL DEFAULT 0, ajuste_manual numeric(14,2) NOT NULL DEFAULT 0, monto numeric(14,2) NOT NULL DEFAULT 0,
  fuente text NOT NULL DEFAULT 'historico', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presupuestos_versiones_lineas_version_idx ON presupuestos_versiones_lineas (version_id);
CREATE INDEX IF NOT EXISTS presupuestos_versiones_lineas_filtro_idx ON presupuestos_versiones_lineas (mes, sucursal_id, unidad_negocio_id);