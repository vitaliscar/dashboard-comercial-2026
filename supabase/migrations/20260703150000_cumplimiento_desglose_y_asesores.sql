-- 1. Desglose CCV/Xibi/Estrategicas en presupuestos (hoja Cumplimiento_Base trae estos 3
-- montos por separado; hasta ahora solo se guardaba el total en `monto`).
ALTER TABLE public.presupuestos
  ADD COLUMN ventas_ccv NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN ventas_xibi NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN ventas_estrategicas NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 2. Cerrar el hueco de RLS: presupuestos usaba USING (true), sin restricción por rol,
-- a diferencia del resto de tablas comerciales que ya usan can_read_row().
DROP POLICY "read presupuestos" ON public.presupuestos;
CREATE POLICY "read presupuestos" ON public.presupuestos FOR SELECT TO authenticated
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL));

-- 3. Cumplimiento por asesor (hoja Cumplimiento_Asesores_Base, hasta ahora no cargada).
CREATE TABLE public.cumplimiento_asesores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  codigo_asesor TEXT NOT NULL,
  asesor TEXT NOT NULL,
  asesor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE SET NULL,
  presupuesto NUMERIC(14,2) NOT NULL DEFAULT 0,
  venta NUMERIC(14,2) NOT NULL DEFAULT 0,
  pct_cumplimiento NUMERIC(6,2) NOT NULL DEFAULT 0,
  pct_participacion NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cumplimiento_asesores TO authenticated;
GRANT ALL ON public.cumplimiento_asesores TO service_role;
ALTER TABLE public.cumplimiento_asesores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cumplimiento_asesores" ON public.cumplimiento_asesores FOR SELECT TO authenticated
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id));
CREATE POLICY "manage cumplimiento_asesores" ON public.cumplimiento_asesores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerencia')) WITH CHECK (public.has_role(auth.uid(), 'gerencia'));
