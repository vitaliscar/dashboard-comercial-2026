-- RLS de la aplicación comercial.
--
-- Esta migración es la versión PostgreSQL del modelo que existía en
-- .migration-backup/src/db/migrations-manual. Debe ejecutarse con el rol
-- administrativo. El API ejecuta cada request de negocio con:
--   BEGIN; SET LOCAL ROLE app_user; SET LOCAL app.current_*; ...; COMMIT;
--
-- No se crea un LOGIN para app_user: el pool de aplicación puede autenticarse
-- con el usuario administrado por el entorno y cambiar al rol no-BYPASS dentro
-- de la transacción. En producción, DATABASE_URL debe ser preferentemente un
-- LOGIN sin BYPASSRLS y DATABASE_ADMIN_URL el LOGIN administrativo.

DO $role_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END
$role_setup$;

ALTER ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT ON TABLE
  cotizaciones, facturas, ventas_perdidas, servicios, cobranzas,
  cobranzas_equipos, cobranzas_snapshots, ventas_casa, minutas,
  minuta_comentarios, minuta_alertas, presupuestos, cumplimiento_asesores,
  comisiones_reglas, equipos_inventario, equipos_facturacion,
  equipos_presupuesto, equipos_facturacion_sucursal, equipos_por_marca,
  mercadeo_canales, mercadeo_instagram, mercadeo_google_business,
  mercadeo_post_historias, clientes_potenciales, alertas, role_module_access,
  sucursales, unidades_negocio, profiles, profile_unidades_negocio,
  profile_sucursales, user_roles, users, sessions, ajustes_manuales
  TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  minutas, minuta_comentarios, minuta_alertas, alertas, role_module_access,
  users, profiles, user_roles, profile_unidades_negocio,
  profile_sucursales, sessions, ajustes_manuales
  TO app_user;

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

CREATE OR REPLACE FUNCTION can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id()
        AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN _sucursal IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_sucursales ps
      WHERE ps.profile_id = current_user_id()
        AND ps.sucursal_id = _sucursal
    )
    WHEN 'asesor' THEN _asesor IS NOT NULL AND _asesor = current_user_id()
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION can_read_row_by_unidad_only(_unidad uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE current_app_role()
    WHEN 'gerencia' THEN true
    WHEN 'gerente_comercial' THEN _unidad IS NOT NULL AND EXISTS (
      SELECT 1 FROM profile_unidades_negocio pun
      WHERE pun.profile_id = current_user_id()
        AND pun.unidad_negocio_id = _unidad
    )
    WHEN 'coordinador' THEN true
    WHEN 'asesor' THEN true
    ELSE false
  END;
$$;

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_perdidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranzas_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_casa ENABLE ROW LEVEL SECURITY;
ALTER TABLE minutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE minuta_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE minuta_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimiento_asesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE comisiones_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_facturacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_facturacion_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos_por_marca ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_instagram ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_google_business ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadeo_post_historias ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_potenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_unidades_negocio ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajustes_manuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_cotizaciones ON cotizaciones FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_facturas ON facturas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_ventas_perdidas ON ventas_perdidas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_servicios ON servicios FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_cobranzas ON cobranzas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_cobranzas_equipos ON cobranzas_equipos FOR SELECT
  USING (can_read_row(sucursal_id, NULL, NULL));
CREATE POLICY select_cobranzas_snapshots ON cobranzas_snapshots FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_ventas_casa ON ventas_casa FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_presupuestos ON presupuestos FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_cumplimiento_asesores ON cumplimiento_asesores FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY select_equipos_inventario ON equipos_inventario FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_facturacion ON equipos_facturacion FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_presupuesto ON equipos_presupuesto FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_por_marca ON equipos_por_marca FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY select_equipos_facturacion_sucursal ON equipos_facturacion_sucursal FOR SELECT
  USING (can_read_row_by_unidad_only(unidad_negocio_id));

-- El campo `sucursal` de equipos_facturacion_sucursal es texto libre; por eso
-- esta tabla conserva la excepción de scope por unidad del proyecto original.
CREATE POLICY select_comisiones_reglas ON comisiones_reglas FOR SELECT
  USING (current_app_role() IN ('gerencia', 'gerente_comercial', 'coordinador'));

CREATE POLICY select_mercadeo_canales ON mercadeo_canales FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_instagram ON mercadeo_instagram FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_google_business ON mercadeo_google_business FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_mercadeo_post_historias ON mercadeo_post_historias FOR SELECT
  USING (current_app_role() = 'gerencia');
CREATE POLICY select_clientes_potenciales ON clientes_potenciales FOR SELECT
  USING (current_app_role() IN ('gerencia', 'gerente_comercial'));

-- Minutas vigentes: el destinatario siempre puede leer la minuta que le
-- corresponde; la escritura sigue la jerarquía del backup.
CREATE POLICY select_minutas ON minutas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL)
         OR destinatario_id = current_user_id());
CREATE POLICY insert_minutas ON minutas FOR INSERT
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND (
      current_app_role() = 'gerencia'
      OR (
        current_app_role() = 'coordinador'
        AND EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = destinatario_id AND ur.role = 'asesor'
        )
      )
      OR (
        current_app_role() = 'gerente_comercial'
        AND EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = destinatario_id AND ur.role = 'coordinador'
        )
      )
    )
  );
CREATE POLICY update_minutas ON minutas FOR UPDATE
  USING (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND destinatario_id <> current_user_id()
  )
  WITH CHECK (
    can_read_row(sucursal_id, unidad_negocio_id, NULL)
    AND current_app_role() <> 'asesor'
    AND destinatario_id <> current_user_id()
  );
CREATE POLICY delete_minutas ON minutas FOR DELETE
  USING (current_app_role() = 'gerencia');

CREATE POLICY select_minuta_comentarios ON minuta_comentarios FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM minutas m
    WHERE m.id = minuta_id
      AND (can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL)
           OR m.destinatario_id = current_user_id())
  ));
CREATE POLICY insert_minuta_comentarios ON minuta_comentarios FOR INSERT
  WITH CHECK (
    autor_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM minutas m
      WHERE m.id = minuta_id AND m.destinatario_id = current_user_id()
    )
  );
CREATE POLICY select_minuta_alertas ON minuta_alertas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM minutas m
    WHERE m.id = minuta_id
      AND (can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL)
           OR m.destinatario_id = current_user_id())
  ));
CREATE POLICY insert_minuta_alertas ON minuta_alertas FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM minutas m
    WHERE m.id = minuta_id
      AND can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL)
  ));

CREATE POLICY select_alertas ON alertas FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY insert_alertas ON alertas FOR INSERT
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY update_alertas ON alertas FOR UPDATE
  USING (can_read_row(sucursal_id, unidad_negocio_id, asesor_id))
  WITH CHECK (can_read_row(sucursal_id, unidad_negocio_id, asesor_id));

CREATE POLICY select_ajustes_manuales ON ajustes_manuales FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL));
CREATE POLICY insert_ajustes_manuales_admin_only ON ajustes_manuales FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
  ));
CREATE POLICY update_ajustes_manuales_admin_only ON ajustes_manuales FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
  ));
CREATE POLICY delete_ajustes_manuales_admin_only ON ajustes_manuales FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = current_user_id() AND is_admin
  ));

-- Identidad: lectura propia, o fuerza de venta dentro del alcance jerárquico.
CREATE POLICY select_profiles ON profiles FOR SELECT
  USING (
    id = current_user_id()
    OR current_app_role() = 'gerencia'
    OR (
      current_app_role() = 'coordinador'
      AND sucursal_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM profile_sucursales ps
        WHERE ps.profile_id = current_user_id() AND ps.sucursal_id = profiles.sucursal_id
      )
    )
    OR (
      current_app_role() = 'gerente_comercial'
      AND unidad_negocio_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM profile_unidades_negocio pun
        WHERE pun.profile_id = current_user_id()
          AND pun.unidad_negocio_id = profiles.unidad_negocio_id
      )
    )
  );
CREATE POLICY select_profile_unidades_negocio ON profile_unidades_negocio FOR SELECT
  USING (profile_id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_profile_sucursales ON profile_sucursales FOR SELECT
  USING (profile_id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_user_roles ON user_roles FOR SELECT
  USING (
    user_id = current_user_id()
    OR current_app_role() = 'gerencia'
    OR (
      current_app_role() = 'coordinador'
      AND EXISTS (
        SELECT 1 FROM profiles p
        JOIN profile_sucursales ps ON ps.sucursal_id = p.sucursal_id
        WHERE p.id = user_roles.user_id AND ps.profile_id = current_user_id()
      )
    )
    OR (
      current_app_role() = 'gerente_comercial'
      AND EXISTS (
        SELECT 1 FROM profiles p
        JOIN profile_unidades_negocio pun
          ON pun.unidad_negocio_id = p.unidad_negocio_id
        WHERE p.id = user_roles.user_id AND pun.profile_id = current_user_id()
      )
    )
  );
CREATE POLICY select_users ON users FOR SELECT
  USING (id = current_user_id() OR current_app_role() = 'gerencia');
CREATE POLICY select_sessions ON sessions FOR SELECT
  USING (user_id = current_user_id());

-- CRUD de identidad y minutas: RLS replica los límites de las acciones
-- administrativas del proyecto original.
CREATE POLICY insert_users_admin_only ON users FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY insert_profiles_admin_only ON profiles FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY insert_user_roles_admin_only ON user_roles FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY update_profiles_admin_only ON profiles FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profiles_admin_only ON profiles FOR DELETE
  USING (current_app_role() = 'gerencia');
CREATE POLICY update_users_admin_only ON users FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_users_admin_only ON users FOR DELETE
  USING (current_app_role() = 'gerencia');
CREATE POLICY delete_user_roles_admin_only ON user_roles FOR DELETE
  USING (current_app_role() = 'gerencia');
CREATE POLICY insert_profile_unidades_negocio_admin_only
  ON profile_unidades_negocio FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profile_unidades_negocio_admin_only
  ON profile_unidades_negocio FOR DELETE
  USING (current_app_role() = 'gerencia');
CREATE POLICY insert_profile_sucursales_admin_only
  ON profile_sucursales FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_profile_sucursales_admin_only
  ON profile_sucursales FOR DELETE
  USING (current_app_role() = 'gerencia');
CREATE POLICY delete_sessions_own_or_admin ON sessions FOR DELETE
  USING (user_id = current_user_id() OR current_app_role() = 'gerencia');

CREATE POLICY select_sucursales ON sucursales FOR SELECT
  USING (current_app_role() IS NOT NULL);
CREATE POLICY select_unidades_negocio ON unidades_negocio FOR SELECT
  USING (current_app_role() IS NOT NULL);
CREATE POLICY select_role_module_access ON role_module_access FOR SELECT
  USING (current_app_role() IS NOT NULL);
CREATE POLICY insert_role_module_access_admin_only ON role_module_access FOR INSERT
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY update_role_module_access_admin_only ON role_module_access FOR UPDATE
  USING (current_app_role() = 'gerencia')
  WITH CHECK (current_app_role() = 'gerencia');
CREATE POLICY delete_role_module_access_admin_only ON role_module_access FOR DELETE
  USING (current_app_role() = 'gerencia');