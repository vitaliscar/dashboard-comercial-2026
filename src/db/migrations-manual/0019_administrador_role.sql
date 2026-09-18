-- Rol `administrador`: acceso total a datos (como gerencia) + exclusivo para
-- alta/baja de usuarios. Gerencia Nacional sigue viendo /usuarios y puede
-- editar/resetear/cambiar roles, pero ya no INSERT users/profiles ni DELETE
-- users/profiles.
-- Ejecutar con app_admin (BYPASSRLS).

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'administrador';
