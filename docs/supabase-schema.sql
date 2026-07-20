-- ⚠️ OBSOLETO — este archivo es un borrador de diseño temprano (tablas "usuarios",
-- "oportunidades", etc.) que NO refleja el esquema real de producción. El esquema
-- vigente vive en supabase/migrations/*.sql y está documentado en docs/SCHEMA.md.
-- Se conserva solo como referencia histórica del diseño inicial.

-- Supabase Schema for Dashboard Comercial 2026
-- Full reload every Friday 5 AM (Caracas time)

-- 1. Usuarios (roles y acceso)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('Gerencia', 'Asesor', 'Coordinador de Operaciones', 'Coordinador Integral de Ventas', 'GC Equi/Alqui', 'GC Lub/Fil', 'GC Servicios', 'GC Repuestos')),
  email TEXT UNIQUE NOT NULL,
  codigo TEXT,
  sucursal TEXT NOT NULL,
  asesores_asignados TEXT[] DEFAULT '{}',
  contraseña TEXT,
  unidad_negocio TEXT NOT NULL DEFAULT 'Repuestos',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. Oportunidades (pipeline de ventas)
CREATE TABLE oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compania TEXT DEFAULT 'CCV',
  sucursal TEXT NOT NULL,
  codigo_asesor TEXT NOT NULL,
  etapa TEXT NOT NULL,
  monto DECIMAL(15, 2),
  monto_facturado DECIMAL(15, 2),
  cliente TEXT NOT NULL,
  unidad_negocio TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 3. Oportunidades Lub/Filtros (cotizaciones agrupadas)
CREATE TABLE oportunidades_lubfiltros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_cotizacion TEXT NOT NULL UNIQUE,
  cantidad_items INTEGER,
  monto_total DECIMAL(15, 2),
  etapa TEXT,
  sucursal TEXT NOT NULL,
  codigo_asesor TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 4. Cumplimiento Base (presupuestos vs ventas)
CREATE TABLE cumplimiento_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  presupuesto DECIMAL(15, 2),
  unidad_negocio TEXT NOT NULL,
  venta_real DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT now()
);

-- 5. Cumplimiento Asesores (meta vs venta por asesor)
CREATE TABLE cumplimiento_asesores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_asesor TEXT NOT NULL,
  asesor TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  unidad_negocio TEXT NOT NULL,
  presupuesto DECIMAL(15, 2),
  venta DECIMAL(15, 2),
  sucursal TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 6. Cuentas por Cobrar
CREATE TABLE cuentas_por_cobrar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal TEXT NOT NULL,
  cliente TEXT,
  monto_cartera DECIMAL(15, 2),
  monto_vencido DECIMAL(15, 2),
  dias_vencimiento INTEGER,
  unidad_negocio TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 7. Ventas Perdidas
CREATE TABLE ventas_perdidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor TEXT NOT NULL,
  codigo_asesor TEXT,
  cliente TEXT NOT NULL,
  razon TEXT,
  monto DECIMAL(15, 2) NOT NULL,
  mes INTEGER,
  ano INTEGER,
  sucursal TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 8. Facturación
CREATE TABLE facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal TEXT NOT NULL,
  cliente TEXT,
  codigo_asesor TEXT,
  tipo_negocio TEXT,
  monto DECIMAL(15, 2),
  mes INTEGER,
  ano INTEGER,
  unidad_negocio TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 9. Servicios
CREATE TABLE servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal TEXT NOT NULL,
  tipo_servicio TEXT,
  monto DECIMAL(15, 2),
  mes INTEGER,
  ano INTEGER,
  unidad_negocio TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 10. Lubricantes/Filtros
CREATE TABLE lubricantes_filtros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal TEXT NOT NULL,
  producto TEXT,
  monto DECIMAL(15, 2),
  cantidad INTEGER,
  mes INTEGER,
  ano INTEGER,
  codigo_asesor TEXT,
  unidad_negocio TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Metadata table for tracking loads
CREATE TABLE data_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_timestamp TIMESTAMP DEFAULT now(),
  status TEXT CHECK (status IN ('success', 'error', 'partial')),
  error_message TEXT,
  rows_affected JSONB
);

-- Indexes for performance
CREATE INDEX idx_oportunidades_sucursal ON oportunidades(sucursal);
CREATE INDEX idx_oportunidades_asesor ON oportunidades(codigo_asesor);
CREATE INDEX idx_oportunidades_unidad_negocio ON oportunidades(unidad_negocio);
CREATE INDEX idx_cumplimiento_base_mes_ano ON cumplimiento_base(mes, ano);
CREATE INDEX idx_cumplimiento_base_unidad_negocio ON cumplimiento_base(unidad_negocio);
CREATE INDEX idx_cumplimiento_asesores_asesor ON cumplimiento_asesores(codigo_asesor);
CREATE INDEX idx_cumplimiento_asesores_unidad_negocio ON cumplimiento_asesores(unidad_negocio);
CREATE INDEX idx_ventas_perdidas_asesor ON ventas_perdidas(codigo_asesor);
CREATE INDEX idx_facturacion_mes ON facturacion(mes, ano);
CREATE INDEX idx_facturacion_unidad_negocio ON facturacion(unidad_negocio);
CREATE INDEX idx_servicios_unidad_negocio ON servicios(unidad_negocio);
CREATE INDEX idx_lubricantes_asesor ON lubricantes_filtros(codigo_asesor);
CREATE INDEX idx_lubricantes_unidad_negocio ON lubricantes_filtros(unidad_negocio);
CREATE INDEX idx_usuarios_unidad_negocio ON usuarios(unidad_negocio);

-- Enable Row Level Security
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidades_lubfiltros ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimiento_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimiento_asesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_perdidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE lubricantes_filtros ENABLE ROW LEVEL SECURITY;
