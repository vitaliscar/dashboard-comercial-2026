-- Reglas de comisión por tramo de cumplimiento, por unidad de negocio.
-- Ver docs/MASTER_STRATEGY.md §4 Módulo 1 (Comisiones Proyectadas).
-- Tasas por defecto (placeholder razonable, ajustable sin tocar código):
--   < 80% cumplimiento  -> 0% comisión
--   80-99% cumplimiento -> 1.0% de la venta
--   >= 100% cumplimiento -> 1.5% de la venta

CREATE TABLE public.comisiones_reglas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidad_negocio_id UUID REFERENCES public.unidades_negocio (id) ON DELETE CASCADE,
    umbral_min_pct NUMERIC(6, 2) NOT NULL,
    umbral_max_pct NUMERIC(6, 2),
    tasa_comision NUMERIC(6, 4) NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comisiones_reglas_unidad ON public.comisiones_reglas (unidad_negocio_id);

GRANT SELECT ON public.comisiones_reglas TO authenticated;
GRANT ALL ON public.comisiones_reglas TO service_role;

ALTER TABLE public.comisiones_reglas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comisiones_reglas_select" ON public.comisiones_reglas FOR SELECT TO authenticated
USING (true);

CREATE POLICY "comisiones_reglas_write" ON public.comisiones_reglas FOR ALL TO authenticated
USING (
    public.has_role(auth.uid(), 'gerencia')
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
    public.has_role(auth.uid(), 'gerencia')
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);

-- Reglas por defecto, aplicadas globalmente (unidad_negocio_id NULL = todas
-- las unidades) hasta que gerencia defina reglas específicas por unidad.
INSERT INTO public.comisiones_reglas (unidad_negocio_id, umbral_min_pct, umbral_max_pct, tasa_comision, activa)
VALUES
    (NULL, 0, 79.99, 0, true),
    (NULL, 80, 99.99, 0.01, true),
    (NULL, 100, NULL, 0.015, true);
