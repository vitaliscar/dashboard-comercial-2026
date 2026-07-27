-- Roles de aplicación para RLS nativo de Postgres (reemplazo de Supabase).
-- app_admin: BYPASSRLS — pipeline de carga de Excel, migraciones, lectura de sesión.
-- app_user: sin BYPASSRLS — sirve requests reales; el scope por rol lo aplican
-- las policies RLS (src/db/migrations-manual/0001_rls_policies.sql) vía SET LOCAL.

CREATE ROLE app_admin WITH LOGIN PASSWORD 'app_admin_dev_pw' BYPASSRLS CREATEROLE;
CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_pw';

GRANT ALL PRIVILEGES ON DATABASE dashboard_comercial TO app_admin;
GRANT CONNECT ON DATABASE dashboard_comercial TO app_user;

-- app_admin es dueño del schema public para poder migrar sin fricción de ACL.
ALTER SCHEMA public OWNER TO app_admin;
GRANT USAGE ON SCHEMA public TO app_user;

-- Privilegios por defecto: cualquier tabla/secuencia creada luego por app_admin
-- (drizzle-kit push, migraciones) queda automáticamente accesible a app_user.
ALTER DEFAULT PRIVILEGES FOR ROLE app_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
