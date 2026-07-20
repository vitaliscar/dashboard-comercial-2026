
-- Roles
CREATE TYPE public.app_role AS ENUM ('gerencia', 'gerente_comercial', 'coordinador', 'asesor');
CREATE TYPE public.minuta_estado AS ENUM ('pendiente', 'en_proceso', 'cumplido');
CREATE TYPE public.cotizacion_etapa AS ENUM ('prospecto', 'presentada', 'negociacion', 'ganada', 'perdida');

-- Sucursales
CREATE TABLE public.sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  ciudad TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sucursales TO authenticated;
GRANT ALL ON public.sucursales TO service_role;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

-- Unidades de negocio
CREATE TABLE public.unidades_negocio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades_negocio TO authenticated;
GRANT ALL ON public.unidades_negocio TO service_role;
ALTER TABLE public.unidades_negocio ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre_completo TEXT,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'gerencia' THEN 1
    WHEN 'gerente_comercial' THEN 2
    WHEN 'coordinador' THEN 3
    WHEN 'asesor' THEN 4
  END LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_sucursal(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sucursal_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_user_unidad(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unidad_negocio_id FROM public.profiles WHERE id = _user_id;
$$;

-- Cotizaciones
CREATE TABLE public.cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  cliente TEXT NOT NULL,
  asesor TEXT,
  asesor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  etapa public.cotizacion_etapa NOT NULL DEFAULT 'prospecto',
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;
GRANT ALL ON public.cotizaciones TO service_role;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

-- Facturas
CREATE TABLE public.facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  numero TEXT,
  cliente TEXT NOT NULL,
  asesor TEXT,
  asesor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas TO authenticated;
GRANT ALL ON public.facturas TO service_role;
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

-- Presupuestos
CREATE TABLE public.presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE CASCADE,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(anio, mes, sucursal_id, unidad_negocio_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presupuestos TO authenticated;
GRANT ALL ON public.presupuestos TO service_role;
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;

-- Ventas perdidas
CREATE TABLE public.ventas_perdidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  cliente TEXT NOT NULL,
  asesor TEXT,
  asesor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  razon TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventas_perdidas TO authenticated;
GRANT ALL ON public.ventas_perdidas TO service_role;
ALTER TABLE public.ventas_perdidas ENABLE ROW LEVEL SECURITY;

-- Cobranzas (cuentas por cobrar)
CREATE TABLE public.cobranzas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente TEXT NOT NULL,
  factura_numero TEXT,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranzas TO authenticated;
GRANT ALL ON public.cobranzas TO service_role;
ALTER TABLE public.cobranzas ENABLE ROW LEVEL SECURITY;

-- Minutas
CREATE TABLE public.minutas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  cliente TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  responsable TEXT NOT NULL,
  responsable_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_limite DATE,
  estado public.minuta_estado NOT NULL DEFAULT 'pendiente',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minutas TO authenticated;
GRANT ALL ON public.minutas TO service_role;
ALTER TABLE public.minutas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER minutas_updated BEFORE UPDATE ON public.minutas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto crear profile al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email));
  -- Rol por defecto: asesor
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'asesor');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============
-- Catalogos (todos los autenticados leen; solo gerencia edita)
CREATE POLICY "read sucursales" ON public.sucursales FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage sucursales" ON public.sucursales FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia')) WITH CHECK (public.has_role(auth.uid(), 'gerencia'));

CREATE POLICY "read unidades" ON public.unidades_negocio FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage unidades" ON public.unidades_negocio FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia')) WITH CHECK (public.has_role(auth.uid(), 'gerencia'));

-- Profiles: usuario ve/edita el suyo; gerencia ve todos
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'gerencia'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'gerencia'));
CREATE POLICY "gerencia insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerencia'));

-- User roles: usuario ve el suyo; gerencia administra
CREATE POLICY "read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gerencia'));
CREATE POLICY "gerencia manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia')) WITH CHECK (public.has_role(auth.uid(), 'gerencia'));

-- Helper: puede ver datos comerciales
CREATE OR REPLACE FUNCTION public.can_read_row(_sucursal UUID, _unidad UUID, _asesor UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(), 'gerencia')
    OR (public.has_role(auth.uid(), 'gerente_comercial') AND _unidad = public.get_user_unidad(auth.uid()))
    OR (public.has_role(auth.uid(), 'coordinador') AND _sucursal = public.get_user_sucursal(auth.uid()))
    OR (public.has_role(auth.uid(), 'asesor') AND _asesor = auth.uid());
$$;

-- Cotizaciones / Facturas / VentasPerdidas: RLS por rol
CREATE POLICY "read cotizaciones" ON public.cotizaciones FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY "insert cotizaciones" ON public.cotizaciones FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));
CREATE POLICY "update cotizaciones" ON public.cotizaciones FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador'));
CREATE POLICY "delete cotizaciones" ON public.cotizaciones FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerencia'));

CREATE POLICY "read facturas" ON public.facturas FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY "insert facturas" ON public.facturas FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial'));
CREATE POLICY "update facturas" ON public.facturas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador'));
CREATE POLICY "delete facturas" ON public.facturas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerencia'));

CREATE POLICY "read ventas_perdidas" ON public.ventas_perdidas FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY "manage ventas_perdidas" ON public.ventas_perdidas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador'));

CREATE POLICY "read presupuestos" ON public.presupuestos FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage presupuestos" ON public.presupuestos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia')) WITH CHECK (public.has_role(auth.uid(), 'gerencia'));

CREATE POLICY "read cobranzas" ON public.cobranzas FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY "manage cobranzas" ON public.cobranzas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador')) WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador'));

-- Minutas
CREATE POLICY "read minutas" ON public.minutas FOR SELECT TO authenticated USING (public.can_read_row(sucursal_id, unidad_negocio_id, responsable_id));
CREATE POLICY "insert minutas" ON public.minutas FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'gerente_comercial') OR public.has_role(auth.uid(), 'coordinador'));
CREATE POLICY "update minutas" ON public.minutas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'gerente_comercial') OR (public.has_role(auth.uid(), 'coordinador') AND sucursal_id = public.get_user_sucursal(auth.uid())));
CREATE POLICY "delete minutas" ON public.minutas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerencia'));
