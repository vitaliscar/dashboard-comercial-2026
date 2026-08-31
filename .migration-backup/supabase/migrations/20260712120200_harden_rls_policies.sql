-- ============================================================================
-- MIGRATION: Harden Row Level Security (RLS) Policies on All Tables
-- Reference: security-remediation.html - Phase 1 - Finding 3
-- ============================================================================

-- 1. Explicitly enable RLS on all 18 tables to ensure no tables are vulnerable
ALTER TABLE IF EXISTS public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.unidades_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ventas_perdidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cobranzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.minutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipos_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipos_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipos_facturacion_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipos_por_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cobranzas_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cumplimiento_asesores ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing RLS policies before recreating them to ensure clean slate
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 3. Re-create hardened RLS policies with strict role checking

-- A. Catalogs (read-only for authenticated, write-only for gerencia)
CREATE POLICY "sucursales_read" ON public.sucursales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sucursales_write" ON public.sucursales FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "unidades_read" ON public.unidades_negocio FOR SELECT TO authenticated USING (true);
CREATE POLICY "unidades_write" ON public.unidades_negocio FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- B. User Profiles & Roles (users can read all profiles to see who is whom, but only edit own profile; is_admin column changes are blocked at trigger level)
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated 
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated 
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_all" ON public.user_roles FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- C. Commercial & Transactional Tables (Subject to role-based scoping using the can_read_row helper)
CREATE POLICY "cotizaciones_select" ON public.cotizaciones FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cotizaciones_insert" ON public.cotizaciones FOR INSERT TO authenticated 
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cotizaciones_update" ON public.cotizaciones FOR UPDATE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cotizaciones_delete" ON public.cotizaciones FOR DELETE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "facturas_select" ON public.facturas FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "facturas_insert" ON public.facturas FOR INSERT TO authenticated 
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "facturas_update" ON public.facturas FOR UPDATE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "facturas_delete" ON public.facturas FOR DELETE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "ventas_perdidas_select" ON public.ventas_perdidas FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "ventas_perdidas_write" ON public.ventas_perdidas FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "servicios_select" ON public.servicios FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "servicios_write" ON public.servicios FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- D. Collection & Debt Tables (Financial data, restricted scoping)
CREATE POLICY "cobranzas_select" ON public.cobranzas FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cobranzas_write" ON public.cobranzas FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "cobranzas_equipos_select" ON public.cobranzas_equipos FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, NULL, NULL) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cobranzas_equipos_write" ON public.cobranzas_equipos FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- E. Meeting Minutes & Checklists (Minutas)
CREATE POLICY "minutas_select" ON public.minutas FOR SELECT TO authenticated 
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, responsable_id) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "minutas_insert" ON public.minutas FOR INSERT TO authenticated 
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'gerente_comercial') OR public.has_role(auth.uid(), 'coordinador') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "minutas_update" ON public.minutas FOR UPDATE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'gerente_comercial') OR (public.has_role(auth.uid(), 'coordinador') AND sucursal_id = public.get_user_sucursal(auth.uid())) OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "minutas_delete" ON public.minutas FOR DELETE TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- F. Budget & Targets Tables (All authenticated users can select to see performance comparison; write restricted to gerencia)
CREATE POLICY "presupuestos_select" ON public.presupuestos FOR SELECT TO authenticated USING (true);
CREATE POLICY "presupuestos_write" ON public.presupuestos FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "cumplimiento_asesores_select" ON public.cumplimiento_asesores FOR SELECT TO authenticated USING (true);
CREATE POLICY "cumplimiento_asesores_write" ON public.cumplimiento_asesores FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- G. Equipment Analytics Modules (Read available for context, write restricted to managers & coordinators)
CREATE POLICY "equipos_inventario_select" ON public.equipos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_inventario_write" ON public.equipos_inventario FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "equipos_facturacion_select" ON public.equipos_facturacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_facturacion_write" ON public.equipos_facturacion FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "equipos_presupuesto_select" ON public.equipos_presupuesto FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_presupuesto_write" ON public.equipos_presupuesto FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "equipos_facturacion_sucursal_select" ON public.equipos_facturacion_sucursal FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_facturacion_sucursal_write" ON public.equipos_facturacion_sucursal FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "equipos_por_marca_select" ON public.equipos_por_marca FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipos_por_marca_write" ON public.equipos_por_marca FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR public.has_role(auth.uid(), 'coordinador') OR public.has_role(auth.uid(), 'gerente_comercial') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
