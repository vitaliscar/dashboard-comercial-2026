-- RLS nativo de Postgres — Fase 4 del plan de migración Supabase -> Postgres.
-- Reemplaza el RLS de Supabase (que leía auth.uid()) por GUCs de sesión
-- (`app.current_*`) inyectados por request vía SET LOCAL en requireAuth
-- (src/lib/server/auth.ts). Ejecutar con el rol app_admin (BYPASSRLS).

-- ── Funciones helper: leen los GUC de sesión seteados por request ──────────
CREATE OR REPLACE FUNCTION current_app_role() RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.current_role', true), '')::app_role;
$$;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_sucursal_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.current_sucursal_id', true), '')::uuid;
$$;

-- Regla central de alcance por rol (equivalente a can_read_row de Supabase).
-- gerencia: todo. gerente_comercial: IN profile_unidades_negocio (soporta
-- multi-unidad, igual que data-scope.ts en el cliente). coordinador: su
-- sucursal. asesor: sus propias filas (asesor_id, ya resuelto en la carga).
CREATE OR REPLACE FUNCTION can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN _sucursal IS NOT NULL AND _sucursal = current_sucursal_id()
    WHEN 'asesor' THEN _asesor IS NOT NULL AND _asesor = current_user_id()
    ELSE false
  END;
$$;

-- Variante para equipos_facturacion_sucursal: `sucursal` es texto libre, no
-- FK (drift documentado en docs/SCHEMA.md) — no se puede comparar contra
-- current_sucursal_id(). Solo se scopea por unidad_negocio_id; coordinador
-- ve todas las filas de su unidad (excepción documentada).
CREATE OR REPLACE FUNCTION can_read_row_by_unidad_only(_unidad uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id() AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN true
    WHEN 'asesor' THEN true
    ELSE false
  END;
$$;

-- ── Habilitar RLS en todas las tablas sensibles ─────────────────────────────
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_perdidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE minutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimiento_asesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_facturacion_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_por_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_unidades_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- ── SELECT: tablas comerciales estándar (sucursal + unidad + asesor) ───────
CREATE POLICY select_cotizaciones ON cotizaciones FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_facturas ON facturas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_ventas_perdidas ON ventas_perdidas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
-- Sin asesor_id (drift conocido: `servicios` solo tiene `asesor` de texto
-- libre, no FK) — scope por sucursal + unidad únicamente.
CREATE POLICY select_servicios ON servicios FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_cobranzas ON cobranzas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_minutas ON minutas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, responsable_id));
CREATE POLICY select_presupuestos ON presupuestos FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL)); -- gap RLS cerrado (§docs/MASTER_STRATEGY.md)
CREATE POLICY select_cumplimiento_asesores ON cumplimiento_asesores FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));

-- Cartera de Equipos/Alquiler — sin unidad_negocio_id.
CREATE POLICY select_cobranzas_equipos ON cobranzas_equipos FOR SELECT
  USING (can_read_row(sucursal_id, NULL, NULL));

-- Equipos (dashboard Equipos) — scope por sucursal + unidad, sin asesor.
CREATE POLICY select_equipos_inventario ON equipos_inventario FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_facturacion ON equipos_facturacion FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_presupuesto ON equipos_presupuesto FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_por_marca ON equipos_por_marca FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));

-- Excepción documentada: `sucursal` es texto libre, no FK.
CREATE POLICY select_equipos_facturacion_sucursal ON equipos_facturacion_sucursal FOR SELECT
  USING (can_read_row_by_unidad_only(unidad_negocio_id));

-- Config global, no scopeada por fila (tasas de comisión por unidad).
CREATE POLICY select_comisiones_reglas ON comisiones_reglas FOR SELECT
  USING (current_app_role() IS NOT NULL);

-- ── Catálogos: lectura abierta a cualquier autenticado ──────────────────────
CREATE POLICY select_sucursales ON sucursales FOR SELECT
  USING (current_app_role() IS NOT NULL);
CREATE POLICY select_unidades_negocio ON unidades_negocio FOR SELECT
  USING (current_app_role() IS NOT NULL);

-- ── Identidad: propia fila, o gerencia ve todo (gestión /usuarios) ─────────
CREATE POLICY select_profiles ON profiles FOR SELECT
  USING (id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_profile_unidades_negocio ON profile_unidades_negocio FOR SELECT
  USING (profile_id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_user_roles ON user_roles FOR SELECT
  USING (user_id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_users ON users FOR SELECT
  USING (id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_sessions ON sessions FOR SELECT
  USING (user_id = current_user_id());

-- ── INSERT/UPDATE: minutas (única tabla con UI de escritura hoy) ──────────
CREATE POLICY insert_minutas ON minutas FOR INSERT
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, responsable_id));
CREATE POLICY update_minutas ON minutas FOR UPDATE
  USING (can_read_row(sucursal_id, unidad_negocio_id, responsable_id))
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, responsable_id));

-- ── INSERT: registro de usuarios restringido a gerencia ─────────────────────
-- (Hoy el loader de Excel siembra usuarios como app_admin/BYPASSRLS, así que
-- esto es defensa en profundidad para una futura UI de registro corriendo
-- como app_user.)
CREATE POLICY insert_users_admin_only ON users FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY insert_profiles_admin_only ON profiles FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY insert_user_roles_admin_only ON user_roles FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
