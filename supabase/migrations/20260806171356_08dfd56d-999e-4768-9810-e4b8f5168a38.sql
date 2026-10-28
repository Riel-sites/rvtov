-- Fix search_path on trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email);
    return new;
end;
$$;

-- Revoke direct execute on security definer functions from public and authenticated.
-- has_role is used by RLS policies; handle_new_user is only called by the trigger.
revoke execute on function public.handle_new_user from public, authenticated;
revoke execute on function public.has_role from public;

-- Re-apply grant so authenticated users can execute has_role through RLS policies.
grant execute on function public.has_role to authenticated;
