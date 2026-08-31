-- Tablas que ya consultan src/routes/_app/equipos.tsx y src/routes/_app/servicios.tsx
-- pero que nunca se crearon en una migración. Columnas derivadas directamente
-- de esas rutas para que coincidan exactamente con lo que la UI espera.

-- Servicios (Dashboard Servicios)
CREATE TABLE public.servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  cliente TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  tipo_servicio TEXT,
  categoria_venta TEXT,
  compania TEXT,
  asesor TEXT,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read servicios" ON public.servicios FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY "manage servicios" ON public.servicios FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Equipos: inventario por marca/mes/año
CREATE TABLE public.equipos_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  marca TEXT NOT NULL,
  disponible INT NOT NULL DEFAULT 0,
  transito INT NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_inventario TO authenticated;
GRANT ALL ON public.equipos_inventario TO service_role;
ALTER TABLE public.equipos_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read equipos_inventario" ON public.equipos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage equipos_inventario" ON public.equipos_inventario FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Equipos: facturado vs presupuesto por mes/año (para el ComposedChart mensual)
CREATE TABLE public.equipos_facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  facturado NUMERIC(14,2) NOT NULL DEFAULT 0,
  presupuesto NUMERIC(14,2) NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_facturacion TO authenticated;
GRANT ALL ON public.equipos_facturacion TO service_role;
ALTER TABLE public.equipos_facturacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read equipos_facturacion" ON public.equipos_facturacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage equipos_facturacion" ON public.equipos_facturacion FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Equipos: presupuesto anual (para el KPI "Presupuesto" y el pie de participación por U/N)
CREATE TABLE public.equipos_presupuesto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_presupuesto TO authenticated;
GRANT ALL ON public.equipos_presupuesto TO service_role;
ALTER TABLE public.equipos_presupuesto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read equipos_presupuesto" ON public.equipos_presupuesto FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage equipos_presupuesto" ON public.equipos_presupuesto FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Equipos: facturación por sucursal (nombre de texto, no FK — así lo consume equipos.tsx)
CREATE TABLE public.equipos_facturacion_sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  sucursal TEXT NOT NULL,
  facturado NUMERIC(14,2) NOT NULL DEFAULT 0,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_facturacion_sucursal TO authenticated;
GRANT ALL ON public.equipos_facturacion_sucursal TO service_role;
ALTER TABLE public.equipos_facturacion_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read equipos_facturacion_sucursal" ON public.equipos_facturacion_sucursal FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage equipos_facturacion_sucursal" ON public.equipos_facturacion_sucursal FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Equipos: participación por marca
CREATE TABLE public.equipos_por_marca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  marca TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos_por_marca TO authenticated;
GRANT ALL ON public.equipos_por_marca TO service_role;
ALTER TABLE public.equipos_por_marca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read equipos_por_marca" ON public.equipos_por_marca FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage equipos_por_marca" ON public.equipos_por_marca FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));

-- Cuentas por cobrar específicas de Equipos/Alquiler
CREATE TABLE public.cobranzas_equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranzas_equipos TO authenticated;
GRANT ALL ON public.cobranzas_equipos TO service_role;
ALTER TABLE public.cobranzas_equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cobranzas_equipos" ON public.cobranzas_equipos FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, NULL, NULL));
CREATE POLICY "manage cobranzas_equipos" ON public.cobranzas_equipos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador'));
