-- Estos helpers SECURITY DEFINER respaldan las policies de RLS y no están pensados
-- para invocarse directamente como RPC de PostgREST por clientes anónimos.
revoke execute on function public.can_read_row(uuid, uuid, uuid) from public, anon;
revoke execute on function public.get_user_role(uuid) from public, anon;
revoke execute on function public.get_user_sucursal(uuid) from public, anon;
revoke execute on function public.get_user_unidad(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.can_read_row(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.get_user_sucursal(uuid) to authenticated;
grant execute on function public.get_user_unidad(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
