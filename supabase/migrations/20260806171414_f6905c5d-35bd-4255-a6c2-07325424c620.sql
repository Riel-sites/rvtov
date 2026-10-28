revoke execute on function public.handle_new_user from anon, authenticated, public;
revoke execute on function public.has_role from anon, authenticated, public;

-- Ensure the function owner retains execute (needed for RLS policies and triggers).
grant execute on function public.has_role to postgres;
grant execute on function public.handle_new_user to postgres;
