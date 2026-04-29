-- Fix: search_path em set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoga execute do anon e do public para todas as funções sensíveis.
revoke execute on function public.has_role(uuid, uuid, public.app_role) from public, anon;
revoke execute on function public.is_member_of_restaurant(uuid, uuid) from public, anon;
revoke execute on function public.is_member_of_tenant(uuid, uuid) from public, anon;
revoke execute on function public.has_any_role_in_restaurant(uuid, uuid, public.app_role[]) from public, anon;
revoke execute on function public.has_any_role_in_tenant(uuid, uuid, public.app_role[]) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant execute on function public.has_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.is_member_of_restaurant(uuid, uuid) to authenticated;
grant execute on function public.is_member_of_tenant(uuid, uuid) to authenticated;
grant execute on function public.has_any_role_in_restaurant(uuid, uuid, public.app_role[]) to authenticated;
grant execute on function public.has_any_role_in_tenant(uuid, uuid, public.app_role[]) to authenticated;
