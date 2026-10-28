CREATE TABLE public.monitoring_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  route text,
  mode text,
  model text,
  duration_ms integer,
  status text,
  error_code text,
  error_message text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX monitoring_events_created_at_idx ON public.monitoring_events (created_at DESC);
CREATE INDEX monitoring_events_type_created_at_idx ON public.monitoring_events (event_type, created_at DESC);

GRANT SELECT ON public.monitoring_events TO authenticated;
GRANT ALL ON public.monitoring_events TO service_role;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read monitoring events" ON public.monitoring_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.health_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target text NOT NULL,
  status text NOT NULL,
  response_ms integer,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX health_checks_target_created_at_idx ON public.health_checks (target, created_at DESC);

GRANT SELECT ON public.health_checks TO authenticated;
GRANT ALL ON public.health_checks TO service_role;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read health checks" ON public.health_checks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_monitoring_summary(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(hours => greatest(coalesce(_hours, 24), 1));
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
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
      FROM public.monitoring_events
      WHERE created_at >= _since
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
        FROM public.monitoring_events
        WHERE created_at >= _since
        GROUP BY 1
      ) d
    ),
    'health', (
      SELECT coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) FROM (
        SELECT DISTINCT ON (target) target, status, response_ms, error, created_at
        FROM public.health_checks
        ORDER BY target, created_at DESC
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

REVOKE ALL ON FUNCTION public.admin_monitoring_summary(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_summary(integer) TO service_role;