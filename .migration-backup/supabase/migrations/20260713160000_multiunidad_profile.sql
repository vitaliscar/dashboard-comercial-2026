-- ============================================================================
-- MIGRATION: Support Multi-Unit Business Scopes for Commercial Managers
-- Date: 2026-07-13
-- ============================================================================

-- 1. Create table bridge profile_unidades_negocio
CREATE TABLE IF NOT EXISTS public.profile_unidades_negocio (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unidad_negocio_id uuid NOT NULL REFERENCES public.unidades_negocio(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profile_unidades_negocio_pkey PRIMARY KEY (profile_id, unidad_negocio_id)
);

-- 2. Enable Row Level Security
ALTER TABLE public.profile_unidades_negocio ENABLE ROW LEVEL SECURITY;

-- 3. Create hardened RLS policies matching profiles
CREATE POLICY "profile_unidades_negocio_select" ON public.profile_unidades_negocio 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profile_unidades_negocio_write" ON public.profile_unidades_negocio 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- 4. Update RPC can_read_row to support multi-unit scoping
CREATE OR REPLACE FUNCTION public.can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'gerencia')
    OR (
      public.has_role(auth.uid(), 'gerente_comercial')
      AND (
        _unidad IN (SELECT unidad_negocio_id FROM public.profile_unidades_negocio WHERE profile_id = auth.uid())
        OR _unidad = public.get_user_unidad(auth.uid())
      )
    )
    OR (public.has_role(auth.uid(), 'coordinador') AND _sucursal = public.get_user_sucursal(auth.uid()))
    OR (public.has_role(auth.uid(), 'asesor') AND _asesor = auth.uid());
$function$;

-- 5. Seed mapping records for current commercial managers in profiles table
INSERT INTO public.profile_unidades_negocio (profile_id, unidad_negocio_id)
VALUES
  -- Nestor Piña (npina@ccvenequip.com) = Equipos + Alquiler
  ('01c051a5-3704-45e2-9031-a941e9f527ef', '78e09e03-c1aa-4ed5-8755-8310102f5220'),
  ('01c051a5-3704-45e2-9031-a941e9f527ef', '825146fc-ab6d-4f9c-97d4-2078f3e67549'),
  -- Julio Maldonado (jmaldonado@ccvenequip.com) = Lubricantes/Filtros
  ('7e2fa6ee-d79d-4865-818d-c7fa2bd08e6c', 'bd01d86c-c8a5-488a-9afc-141d242b9325'),
  -- Marcos Ruiz (mruiz@ccvenequip.com) = Servicios
  ('c035851a-88de-4a4e-8534-297f56ff9924', '9c322ad9-75af-4f88-912e-182e708264d3'),
  -- Abrahan Chavez (abchavez@ccvenequip.com) = Repuestos
  ('08f7a6de-2c96-4ecd-abc2-0ff89c498b99', '8fc832e2-e67f-4204-9f4c-087b2ec36660')
ON CONFLICT DO NOTHING;
