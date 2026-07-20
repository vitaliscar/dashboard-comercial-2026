-- Row Level Security Policies for Dashboard Comercial 2026 (Simplified)
-- No custom functions needed for Supabase Cloud

-- ============================================
-- USUARIOS TABLE POLICIES
-- ============================================

-- Gerencia: can see all users
CREATE POLICY "Gerencia_view_all_usuarios" ON usuarios
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: can see their own record only
CREATE POLICY "Asesores_view_own_usuarios" ON usuarios
  FOR SELECT
  USING (auth.uid() = id);

-- Coordinadores: can see all users in their sucursal
CREATE POLICY "Coordinadores_view_sucursal_usuarios" ON usuarios
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- OPORTUNIDADES TABLE POLICIES
-- ============================================

-- Gerencia: can see all opportunities
CREATE POLICY "Gerencia_view_all_oportunidades" ON oportunidades
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: can see only their own opportunities
CREATE POLICY "Asesores_view_own_oportunidades" ON oportunidades
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: can see all opportunities in their sucursal
CREATE POLICY "Coordinadores_view_sucursal_oportunidades" ON oportunidades
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- OPORTUNIDADES_LUBFILTROS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: view only their own
CREATE POLICY "Asesores_view_own_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_lubfiltros" ON oportunidades_lubfiltros
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- CUMPLIMIENTO_BASE TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- GC Unidades: view their unit
CREATE POLICY "GCUnidades_view_un_cumplimiento_base" ON cumplimiento_base
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'GC Unidades');

-- ============================================
-- CUMPLIMIENTO_ASESORES TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: view only their own performance
CREATE POLICY "Asesores_view_own_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: view team performance (same sucursal)
CREATE POLICY "Coordinadores_view_sucursal_cumplimiento_asesores" ON cumplimiento_asesores
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- CUENTAS_POR_COBRAR TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_cuentas" ON cuentas_por_cobrar
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_cuentas" ON cuentas_por_cobrar
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- VENTAS_PERDIDAS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: view only their own lost sales
CREATE POLICY "Asesores_view_own_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_ventas_perdidas" ON ventas_perdidas
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- FACTURACION TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_facturacion" ON facturacion
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: view only their own invoices
CREATE POLICY "Asesores_view_own_facturacion" ON facturacion
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_facturacion" ON facturacion
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- SERVICIOS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_servicios" ON servicios
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_servicios" ON servicios
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- ============================================
-- LUBRICANTES_FILTROS TABLE POLICIES
-- ============================================

-- Gerencia: view all
CREATE POLICY "Gerencia_view_all_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING ((SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Gerencia');

-- Asesores: view only their own sales
CREATE POLICY "Asesores_view_own_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Asesores'
    AND codigo_asesor = (SELECT codigo FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );

-- Coordinadores: view sucursal
CREATE POLICY "Coordinadores_view_sucursal_lubricantes" ON lubricantes_filtros
  FOR SELECT
  USING (
    (SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1) = 'Coordinadores'
    AND sucursal = (SELECT sucursal FROM usuarios WHERE id = auth.uid() LIMIT 1)
  );
