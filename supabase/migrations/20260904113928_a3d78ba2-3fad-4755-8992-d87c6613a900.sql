-- 1. Owner becomes admin
insert into public.user_roles (user_id, role)
select id, 'admin'::app_role from public.profiles where email = 'baddyballouy@gmail.com'
on conflict (user_id, role) do nothing;

-- 2. New users get shopper role by default
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'shopper'::app_role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

-- 3. Admin: list users with roles
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, brand_name text, roles text[], created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.email, p.full_name, p.brand_name,
           coalesce(array_agg(r.role::text order by r.role) filter (where r.role is not null), '{}'::text[]) as roles,
           p.created_at
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    group by p.id
    order by p.created_at desc;
end;
$$;

-- 4. Admin: grant/revoke a role
create or replace function public.set_user_role(_user_id uuid, _role app_role, _grant boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  if _user_id = auth.uid() and _role = 'admin'::app_role and not _grant then
    raise exception 'cannot remove your own admin role';
  end if;
  if _grant then
    insert into public.user_roles (user_id, role) values (_user_id, _role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.set_user_role(uuid, app_role, boolean) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.set_user_role(uuid, app_role, boolean) to authenticated;