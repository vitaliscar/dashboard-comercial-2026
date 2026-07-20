-- Row Level Security Policies for Dashboard Comercial 2026
-- Restricts data access by user role

-- Helper function to get current user's role and codigo_asesor
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS TEXT AS $$
  SELECT role FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.user_codigo_asesor() RETURNS TEXT AS $$
  SELECT codigo FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1
$$ LANGUAGE SQL STABLE;

-- ============================================
-- USUARIOS TABLE POLICIES
-- ============================================

-- Gerencia: can see all users
CREATE POLICY "Gerencia_view_all_usuarios" ON usuarios
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: can see their own record only
CREATE POLICY "Asesores_view_own_usuarios" ON usuarios
  FOR SELECT
  USING (auth.user_role() = 'Asesores' AND email = auth.jwt() ->> 'email');

-- Coordinadores: can see all users in their sucursal
CREATE POLICY "Coordinadores_view_sucursal_usuarios" ON usuarios
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- OPORTUNIDADES TABLE POLICIES
-- ============================================

-- Gerencia: can see all opportunities
CREATE POLICY "Gerencia_view_all_oportunidades" ON oportunidades
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: can see only their own opportunities
CREATE POLICY "Asesores_view_own_oportunidades" ON oportunidades
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: can see all opportunities in their sucursal
CREATE POLICY "Coordinadores_view_sucursal_oportunidades" ON oportunidades
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- OPORTUNIDADES_LUBFILTROS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: view only their own
CREATE POLICY "Asesores_view_own_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- CUMPLIMIENTO_BASE TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- GC Unidades: view their unit
CREATE POLICY "GCUnidades_view_un_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING (auth.user_role() = 'GC Unidades');

-- ============================================
-- CUMPLIMIENTO_ASESORES TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: view only their own performance
CREATE POLICY "Asesores_view_own_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: view team performance (same sucursal)
CREATE POLICY "Coordinadores_view_sucursal_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- CUENTAS_POR_COBRAR TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cuentas" ON cuentas_por_cobrar
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_cuentas" ON cuentas_por_cobrar
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- VENTAS_PERDIDAS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: view only their own lost sales
CREATE POLICY "Asesores_view_own_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- FACTURACION TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_facturacion" ON facturacion
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: view only their own invoices
CREATE POLICY "Asesores_view_own_facturacion" ON facturacion
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_facturacion" ON facturacion
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- SERVICIOS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_servicios" ON servicios
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_servicios" ON servicios
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));

-- ============================================
-- LUBRICANTES_FILTROS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING (auth.user_role() = 'Gerencia');

-- Asesores: view only their own sales
CREATE POLICY "Asesores_view_own_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING (auth.user_role() = 'Asesores'
    AND codigo_asesor = auth.user_codigo_asesor());

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING (auth.user_role() = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE email = auth.jwt() ->> 'email' LIMIT 1));
