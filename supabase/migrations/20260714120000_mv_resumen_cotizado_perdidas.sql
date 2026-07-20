-- Materialized Views de agregación mensual (sucursal x unidad) para descargar del
-- frontend el cálculo de KPIs que hoy se agregan en cliente sobre filas crudas
-- (ver docs/MASTER_STRATEGY.md §1.4). Se refrescan exclusivamente desde el pipeline
-- de carga de Excel (load-excel.ts), no vía pg_cron: el dato solo cambia cuando
-- corre la carga.
--
-- Fuentes de verdad respetadas (ver CLAUDE.md / docs/SCHEMA.md):
--   - Facturado  = presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas
--   - Cotizado   = cotizaciones.monto (ya neto de Lub/Filtros por el parser)
--   - Perdido    = ventas_perdidas.monto

-- 1. Resumen mensual de meta/facturado por sucursal x unidad (base de
--    gerencia-nacional, resumen, coordinador).
CREATE MATERIALIZED VIEW public.mv_resumen_mensual AS
SELECT
    p.anio,
    p.mes,
    p.sucursal_id,
    p.unidad_negocio_id,
    SUM(p.monto) AS meta,
    SUM(
        p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas
    ) AS facturado,
    SUM(p.ventas_ccv) AS facturado_ccv,
    SUM(p.ventas_xibi) AS facturado_xibi,
    SUM(p.ventas_estrategicas) AS facturado_estrategicas
FROM public.presupuestos p
GROUP BY
    p.anio,
    p.mes,
    p.sucursal_id,
    p.unidad_negocio_id;

CREATE UNIQUE INDEX ux_mv_resumen_mensual ON public.mv_resumen_mensual (
    anio, mes, sucursal_id, unidad_negocio_id
);

-- 2. Cotizado neto mensual por sucursal x unidad (base del embudo y Pareto Cotizado).
CREATE MATERIALIZED VIEW public.mv_cotizado_mensual AS
SELECT
    date_part('year', c.fecha)::int AS anio,
    date_part('month', c.fecha)::int AS mes,
    c.sucursal_id,
    c.unidad_negocio_id,
    SUM(c.monto) AS cotizado,
    SUM(c.monto_perdido) AS monto_perdido,
    COUNT(*) AS n_cotizaciones
FROM public.cotizaciones c
GROUP BY
    date_part('year', c.fecha),
    date_part('month', c.fecha),
    c.sucursal_id,
    c.unidad_negocio_id;

CREATE UNIQUE INDEX ux_mv_cotizado_mensual ON public.mv_cotizado_mensual (
    anio, mes, sucursal_id, unidad_negocio_id
);

-- 3. Ventas perdidas mensuales por sucursal x unidad (base de Pareto Ventas Perdidas).
CREATE MATERIALIZED VIEW public.mv_perdidas_mensual AS
SELECT
    date_part('year', v.fecha)::int AS anio,
    date_part('month', v.fecha)::int AS mes,
    v.sucursal_id,
    v.unidad_negocio_id,
    SUM(v.monto) AS perdido,
    COUNT(*) AS n_perdidas
FROM public.ventas_perdidas v
GROUP BY
    date_part('year', v.fecha),
    date_part('month', v.fecha),
    v.sucursal_id,
    v.unidad_negocio_id;

CREATE UNIQUE INDEX ux_mv_perdidas_mensual ON public.mv_perdidas_mensual (
    anio, mes, sucursal_id, unidad_negocio_id
);

-- Las MVs no heredan RLS de sus tablas base. Se otorga SELECT a `authenticated`
-- y el scope por rol se re-impone en RPCs de lectura (ver rpc_resumen_mensual /
-- rpc_embudo_totales más abajo), nunca leyendo la MV directamente desde el
-- cliente sin pasar por un RPC — de lo contrario cualquier autenticado vería
-- el dato de todas las sucursales/unidades.
REVOKE ALL ON public.mv_resumen_mensual FROM public, anon, authenticated;
REVOKE ALL ON public.mv_cotizado_mensual FROM public, anon, authenticated;
REVOKE ALL ON public.mv_perdidas_mensual FROM public, anon, authenticated;

GRANT SELECT ON public.mv_resumen_mensual TO service_role;
GRANT SELECT ON public.mv_cotizado_mensual TO service_role;
GRANT SELECT ON public.mv_perdidas_mensual TO service_role;

-- RPC scopeado de lectura del resumen mensual: re-impone can_read_row fila a
-- fila sobre la MV (que no tiene RLS propia), igual que las tablas base.
CREATE OR REPLACE FUNCTION public.rpc_resumen_mensual(_anio int)
RETURNS TABLE (
    anio int,
    mes int,
    sucursal_id uuid,
    unidad_negocio_id uuid,
    meta numeric,
    facturado numeric,
    facturado_ccv numeric,
    facturado_xibi numeric,
    facturado_estrategicas numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        m.anio,
        m.mes,
        m.sucursal_id,
        m.unidad_negocio_id,
        m.meta,
        m.facturado,
        m.facturado_ccv,
        m.facturado_xibi,
        m.facturado_estrategicas
    FROM public.mv_resumen_mensual m
    WHERE
        m.anio = _anio
        AND (
            public.can_read_row(m.sucursal_id, m.unidad_negocio_id, NULL)
            OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
        );
$$;

REVOKE ALL ON FUNCTION public.rpc_resumen_mensual (int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resumen_mensual (int) TO authenticated;

-- RPC scopeado de lectura del cotizado mensual.
CREATE OR REPLACE FUNCTION public.rpc_cotizado_mensual(_anio int)
RETURNS TABLE (
    anio int,
    mes int,
    sucursal_id uuid,
    unidad_negocio_id uuid,
    cotizado numeric,
    monto_perdido numeric,
    n_cotizaciones bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.anio,
        c.mes,
        c.sucursal_id,
        c.unidad_negocio_id,
        c.cotizado,
        c.monto_perdido,
        c.n_cotizaciones
    FROM public.mv_cotizado_mensual c
    WHERE
        c.anio = _anio
        AND (
            public.can_read_row(c.sucursal_id, c.unidad_negocio_id, NULL)
            OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
        );
$$;

REVOKE ALL ON FUNCTION public.rpc_cotizado_mensual (int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cotizado_mensual (int) TO authenticated;

-- RPC scopeado de lectura de ventas perdidas mensuales.
CREATE OR REPLACE FUNCTION public.rpc_perdidas_mensual(_anio int)
RETURNS TABLE (
    anio int,
    mes int,
    sucursal_id uuid,
    unidad_negocio_id uuid,
    perdido numeric,
    n_perdidas bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.anio,
        p.mes,
        p.sucursal_id,
        p.unidad_negocio_id,
        p.perdido,
        p.n_perdidas
    FROM public.mv_perdidas_mensual p
    WHERE
        p.anio = _anio
        AND (
            public.can_read_row(p.sucursal_id, p.unidad_negocio_id, NULL)
            OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
        );
$$;

REVOKE ALL ON FUNCTION public.rpc_perdidas_mensual (int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_perdidas_mensual (int) TO authenticated;

-- RPC del embudo total cross-source, ya scopeado, para reemplazar el cruce
-- client-side de cotizaciones + presupuestos + cobranzas en computeFunnelTotals().
CREATE OR REPLACE FUNCTION public.rpc_embudo_totales(_anio int, _meses int [] DEFAULT NULL)
RETURNS TABLE (cotizado numeric, facturado numeric, cobrado numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH cot AS (
        SELECT COALESCE(SUM(c.monto), 0) AS v
        FROM public.cotizaciones c
        WHERE
            date_part('year', c.fecha) = _anio
            AND (_meses IS NULL OR date_part('month', c.fecha) = ANY (_meses))
            AND (
                public.can_read_row(c.sucursal_id, c.unidad_negocio_id, c.asesor_id)
                OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
            )
    ),

    fac AS (
        SELECT COALESCE(SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas), 0) AS v
        FROM public.presupuestos p
        WHERE
            p.anio = _anio
            AND (_meses IS NULL OR p.mes = ANY (_meses))
            AND (
                public.can_read_row(p.sucursal_id, p.unidad_negocio_id, NULL)
                OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
            )
    ),

    sal AS (
        SELECT COALESCE(SUM(cb.saldo), 0) AS v
        FROM public.cobranzas cb
        WHERE
            public.can_read_row(cb.sucursal_id, cb.unidad_negocio_id, NULL)
            OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    )

    SELECT cot.v, fac.v, GREATEST(0, fac.v - sal.v) FROM cot, fac, sal;
$$;

REVOKE ALL ON FUNCTION public.rpc_embudo_totales (int, int []) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_embudo_totales (int, int []) TO authenticated;

-- Refresh de las 3 MVs, invocado por el pipeline de carga (load-excel.ts) tras
-- el último insertChunked, y disponible para disparo manual desde /carga.
-- SECURITY DEFINER porque REFRESH MATERIALIZED VIEW requiere ser dueño de la MV;
-- solo callable por roles con permiso de carga (gerencia/admin), verificado
-- dentro de la función en vez de vía GRANT selectivo por rol de negocio.
CREATE OR REPLACE FUNCTION public.refresh_todas_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (
        public.has_role(auth.uid(), 'gerencia')
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'permiso denegado: refresh_todas_mv requiere rol gerencia o is_admin';
    END IF;

    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_resumen_mensual;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cotizado_mensual;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_perdidas_mensual;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_todas_mv () FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_todas_mv () TO authenticated;

-- Carga inicial de datos ya existentes al momento de aplicar la migración.
REFRESH MATERIALIZED VIEW public.mv_resumen_mensual;
REFRESH MATERIALIZED VIEW public.mv_cotizado_mensual;
REFRESH MATERIALIZED VIEW public.mv_perdidas_mensual;
