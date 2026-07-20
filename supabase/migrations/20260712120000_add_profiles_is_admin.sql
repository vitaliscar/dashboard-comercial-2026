alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Backfill: reemplaza el SUPER_ADMIN_EMAIL hardcodeado que existía en src/hooks/use-auth.tsx.
update public.profiles set is_admin = true where email = 'aperez@ccvenequip.com';

comment on column public.profiles.is_admin is
  'Reemplaza el email hardcodeado SUPER_ADMIN_EMAIL en use-auth.tsx. Solo gerencia puede modificarlo.';

-- "update own profile" permite id = auth.uid() sin restricción a nivel de columna:
-- sin este trigger, cualquier usuario autenticado podría auto-otorgarse is_admin = true
-- vía un update normal del cliente a su propia fila de profiles.
create or replace function public.protect_is_admin_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.has_role(auth.uid(), 'gerencia'::app_role) then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin_column on public.profiles;
create trigger protect_is_admin_column
  before update on public.profiles
  for each row
  execute function public.protect_is_admin_column();
