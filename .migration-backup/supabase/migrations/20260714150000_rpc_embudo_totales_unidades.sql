-- embudo.tsx filtra el KPI hero por unidad de negocio (selectedUnidades), algo
-- que rpc_embudo_totales(_anio, _meses) no podía expresar. Se añade _unidades
-- opcional para no perder ese filtro al migrar el frontend al RPC. El CTE de
-- cobranzas (`sal`) se deja sin filtro de unidad a propósito: el código
-- original tampoco lo filtraba ahí (el saldo total de cartera es agnóstico de
-- unidad en la UI actual).

DROP FUNCTION IF EXISTS public.rpc_embudo_totales (int, int []);

CREATE FUNCTION public.rpc_embudo_totales(
    _anio int,
    _meses int [] DEFAULT NULL,
    _unidades uuid [] DEFAULT NULL
)
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
            AND (_unidades IS NULL OR c.unidad_negocio_id = ANY (_unidades))
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
            AND (_unidades IS NULL OR p.unidad_negocio_id = ANY (_unidades))
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

REVOKE ALL ON FUNCTION public.rpc_embudo_totales (int, int [], uuid []) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_embudo_totales (int, int [], uuid []) TO authenticated;
