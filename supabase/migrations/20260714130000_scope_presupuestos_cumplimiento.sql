-- Cierra el gap de RLS detectado en docs/MASTER_STRATEGY.md §1.4: las políticas
-- de lectura de `presupuestos` y `cumplimiento_asesores` estaban en USING(true),
-- sin restricción real por sucursal/unidad/asesor (solo mitigado en cliente por
-- `scoped()`, que es un atajo de UX, no una defensa).
--
-- Verificado antes de aplicar (contra el esquema real en producción):
--   - can_read_row(_sucursal, _unidad, _asesor): coordinador se filtra solo por
--     _sucursal (ignora _unidad), gerente_comercial por _unidad (single o
--     multi-unidad), asesor solo por _asesor = auth.uid().
--   - `presupuestos` no tiene columna de asesor → se pasa NULL como _asesor.
--     Esto significa que el rol `asesor` NUNCA verá filas de `presupuestos` vía
--     RLS. Se confirmó (grep sobre src/routes/_app) que NINGUNA ruta usada por
--     el rol asesor (asesor.tsx) consulta la tabla `presupuestos` directamente
--     — solo usa `cumplimiento_asesores`, que sí tiene `asesor_id` y se scopea
--     correctamente abajo. Por tanto este cambio no rompe /asesor.
--   - `cumplimiento_asesores` sí tiene `asesor_id` → se pasa la columna real,
--     igual que en cotizaciones/facturas/ventas_perdidas.

DROP POLICY IF EXISTS "presupuestos_select" ON public.presupuestos;
CREATE POLICY "presupuestos_select" ON public.presupuestos FOR SELECT TO authenticated
USING (
    public.can_read_row(sucursal_id, unidad_negocio_id, NULL)
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "cumplimiento_asesores_select" ON public.cumplimiento_asesores;
CREATE POLICY "cumplimiento_asesores_select" ON public.cumplimiento_asesores FOR SELECT TO authenticated
USING (
    public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id)
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);
