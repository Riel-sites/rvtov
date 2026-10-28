CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------- private (SECURITY DEFINER) implementations ----------
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

CREATE OR REPLACE FUNCTION private.admin_list_users()
RETURNS TABLE(id uuid, email text, full_name text, brand_name text, roles text[], created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
begin
  if not private.has_role(auth.uid(), 'admin'::app_role) then
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

CREATE OR REPLACE FUNCTION private.set_user_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not private.has_role(auth.uid(), 'admin'::app_role) then
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

CREATE OR REPLACE FUNCTION private.admin_monitoring_summary(_hours integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _since timestamptz := now() - make_interval(hours => greatest(coalesce(_hours, 24), 1));
  _result jsonb;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'since', _since,
    'generation', (
      SELECT jsonb_build_object(
        'started', count(*) FILTER (WHERE event_type = 'tryon_started'),
        'succeeded', count(*) FILTER (WHERE event_type = 'tryon_succeeded'),
        'failed', count(*) FILTER (WHERE event_type = 'tryon_failed'),
        'median_ms', percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE event_type = 'tryon_succeeded' AND duration_ms IS NOT NULL),
        'p95_ms', percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE event_type = 'tryon_succeeded' AND duration_ms IS NOT NULL)
      )
      FROM public.monitoring_events WHERE created_at >= _since
    ),
    'by_mode', (
      SELECT coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) FROM (
        SELECT coalesce(mode, 'unknown') AS mode,
               count(*) FILTER (WHERE event_type = 'tryon_succeeded') AS succeeded,
               count(*) FILTER (WHERE event_type = 'tryon_failed') AS failed
        FROM public.monitoring_events
        WHERE created_at >= _since AND event_type IN ('tryon_succeeded', 'tryon_failed')
        GROUP BY 1 ORDER BY 2 DESC
      ) m
    ),
    'recent_failures', (
      SELECT coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb) FROM (
        SELECT created_at, mode, model, error_code, left(coalesce(error_message, ''), 300) AS error_message
        FROM public.monitoring_events
        WHERE event_type = 'tryon_failed' AND created_at >= _since
        ORDER BY created_at DESC LIMIT 20
      ) f
    ),
    'error_groups', (
      SELECT coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) FROM (
        SELECT left(coalesce(error_message, coalesce(error_code, 'unknown error')), 200) AS message,
               coalesce(route, 'unknown') AS route,
               count(*) AS count,
               max(created_at) AS last_seen
        FROM public.monitoring_events
        WHERE created_at >= _since AND event_type IN ('client_error', 'page_error', 'server_error')
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20
      ) e
    ),
    'daily', (
      SELECT coalesce(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb) FROM (
        SELECT date_trunc('day', created_at) AS day,
               count(*) FILTER (WHERE event_type = 'tryon_succeeded') AS tryons,
               count(*) FILTER (WHERE event_type IN ('client_error', 'page_error', 'server_error', 'tryon_failed')) AS errors
        FROM public.monitoring_events WHERE created_at >= _since GROUP BY 1
      ) d
    ),
    'health', (
      SELECT coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) FROM (
        SELECT DISTINCT ON (target) target, status, response_ms, error, created_at
        FROM public.health_checks ORDER BY target, created_at DESC
      ) h
    ),
    'usage', (
      SELECT jsonb_build_object(
        'signups', (SELECT count(*) FROM public.profiles WHERE created_at >= _since),
        'total_users', (SELECT count(*) FROM public.profiles),
        'active_users', (SELECT count(DISTINCT user_id) FROM public.monitoring_events WHERE created_at >= _since AND user_id IS NOT NULL),
        'tryon_sessions', (SELECT count(*) FROM public.try_on_sessions WHERE created_at >= _since),
        'users_with_tryon', (SELECT count(DISTINCT user_id) FROM public.try_on_sessions WHERE created_at >= _since),
        'orders', (SELECT count(*) FROM public.orders WHERE created_at >= _since)
      )
    ),
    'top_products', (
      SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) FROM (
        SELECT pr.name, count(*) AS tryons
        FROM public.try_on_sessions s
        JOIN public.products pr ON pr.id = s.product_id
        WHERE s.created_at >= _since
        GROUP BY pr.name ORDER BY 2 DESC LIMIT 10
      ) p
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.set_user_role(uuid, app_role, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.admin_monitoring_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_user_role(uuid, app_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_monitoring_summary(integer) TO authenticated, service_role;

-- ---------- public SECURITY INVOKER wrappers (API surface) ----------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select private.has_role(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, full_name text, brand_name text, roles text[], created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select * from private.admin_list_users();
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  select private.set_user_role(_user_id, _role, _grant);
$$;

CREATE OR REPLACE FUNCTION public.admin_monitoring_summary(_hours integer DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  select private.admin_monitoring_summary(_hours);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, app_role, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_monitoring_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, app_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_summary(integer) TO authenticated, service_role;