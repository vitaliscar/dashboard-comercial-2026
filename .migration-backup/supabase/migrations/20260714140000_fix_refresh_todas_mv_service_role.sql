-- refresh_todas_mv() se llama desde load-excel.ts usando la service_role key
-- (sin sesión de usuario autenticado: auth.uid() es NULL en ese contexto), pero
-- la función original solo aceptaba has_role(auth.uid(), 'gerencia') o is_admin
-- de profiles — ambos evalúan a NULL/false para una llamada por service_role,
-- por lo que el propio pipeline de carga se auto-rechazaba. Se añade el check
-- de auth.role() = 'service_role' (claim estándar del JWT de Supabase para la
-- service role key) y se otorga EXECUTE explícito a service_role.

CREATE OR REPLACE FUNCTION public.refresh_todas_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (
        auth.role() = 'service_role'
        OR public.has_role(auth.uid(), 'gerencia')
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'permiso denegado: refresh_todas_mv requiere service_role, rol gerencia o is_admin';
    END IF;

    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_resumen_mensual;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cotizado_mensual;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_perdidas_mensual;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_todas_mv () TO service_role;
