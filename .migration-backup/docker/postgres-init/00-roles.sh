#!/bin/bash
# Roles de aplicación. Passwords desde env del contenedor (CN-003).
# Defaults SOLO para desarrollo local; en prod obligar APP_*_PASSWORD en .env.
set -euo pipefail

APP_ADMIN_PASSWORD="${APP_ADMIN_PASSWORD:-app_admin_dev_pw}"
APP_USER_PASSWORD="${APP_USER_PASSWORD:-app_user_dev_pw}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
CREATE ROLE app_admin WITH LOGIN PASSWORD '${APP_ADMIN_PASSWORD}' BYPASSRLS CREATEROLE;
CREATE ROLE app_user WITH LOGIN PASSWORD '${APP_USER_PASSWORD}';

GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO app_admin;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;

ALTER SCHEMA public OWNER TO app_admin;
GRANT USAGE ON SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE app_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
EOSQL
