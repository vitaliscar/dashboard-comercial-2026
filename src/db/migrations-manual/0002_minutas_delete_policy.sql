-- Cierra un gap dejado por 0001: `minutas` tenía SELECT/INSERT/UPDATE pero
-- ninguna policy de DELETE — un DELETE corrido con el rol app_user (sin
-- BYPASSRLS) habría afectado 0 filas en silencio. La UI ya restringía el
-- borrado a gerencia (ver src/app/(app)/minutas/page.tsx); esta policy lo
-- hace cumplir también a nivel de base de datos.
CREATE POLICY delete_minutas ON minutas FOR DELETE
  USING (current_app_role() = 'gerencia');
