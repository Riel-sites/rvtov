CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  total_granted integer NOT NULL DEFAULT 0,
  total_consumed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credits" ON public.user_credits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all credits" ON public.user_credits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL,
  reason text,
  actor_id uuid,
  balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX token_transactions_user_idx ON public.token_transactions(user_id, created_at DESC);
CREATE INDEX token_transactions_created_idx ON public.token_transactions(created_at DESC);
GRANT SELECT ON public.token_transactions TO authenticated;
GRANT ALL ON public.token_transactions TO service_role;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own token transactions" ON public.token_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all token transactions" ON public.token_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.monitoring_events
  ADD COLUMN prompt_tokens integer,
  ADD COLUMN completion_tokens integer,
  ADD COLUMN total_tokens integer,
  ADD COLUMN cost_usd numeric(10,4);

-- Backfill: every existing user gets the 5 starter tokens
INSERT INTO public.user_credits (user_id, balance, total_granted)
SELECT id, 5, 5 FROM auth.users ON CONFLICT DO NOTHING;
INSERT INTO public.token_transactions (user_id, amount, type, reason, balance_after)
SELECT id, 5, 'signup_bonus', 'Starter tokens', 5 FROM auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'shopper'::app_role)
  on conflict (user_id, role) do nothing;
  insert into public.user_credits (user_id, balance, total_granted) values (new.id, 5, 5)
  on conflict (user_id) do nothing;
  insert into public.token_transactions (user_id, amount, type, reason, balance_after)
  values (new.id, 5, 'signup_bonus', 'Starter tokens', 5);
  return new;
end;
$$;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Atomic 1-token deduction (service role only). Returns new balance, or -1 if insufficient.
CREATE OR REPLACE FUNCTION private.consume_user_token(_user_id uuid, _reason text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare nb integer;
begin
  update public.user_credits
     set balance = balance - 1, total_consumed = total_consumed + 1, updated_at = now()
   where user_id = _user_id and balance >= 1
  returning balance into nb;
  if nb is null then return -1; end if;
  insert into public.token_transactions (user_id, amount, type, reason, balance_after)
  values (_user_id, -1, 'tryon_usage', _reason, nb);
  return nb;
end;
$$;
REVOKE ALL ON FUNCTION private.consume_user_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.consume_user_token(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_user_token(_user_id uuid, _reason text)
 RETURNS integer LANGUAGE sql SET search_path TO 'public'
AS $$ select private.consume_user_token(_user_id, _reason); $$;
REVOKE ALL ON FUNCTION public.consume_user_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_user_token(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION private.admin_adjust_user_tokens(_user_id uuid, _amount integer, _reason text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare nb integer;
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if _amount = 0 then raise exception 'amount must be non-zero'; end if;
  insert into public.user_credits (user_id) values (_user_id) on conflict do nothing;
  update public.user_credits
     set balance = greatest(0, balance + _amount),
         total_granted = total_granted + greatest(_amount, 0),
         updated_at = now()
   where user_id = _user_id
  returning balance into nb;
  insert into public.token_transactions (user_id, amount, type, reason, actor_id, balance_after)
  values (_user_id, _amount, case when _amount > 0 then 'admin_grant' else 'admin_adjustment' end, _reason, auth.uid(), nb);
  return nb;
end;
$$;
REVOKE ALL ON FUNCTION private.admin_adjust_user_tokens(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_adjust_user_tokens(uuid, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_user_tokens(_user_id uuid, _amount integer, _reason text)
 RETURNS integer LANGUAGE sql SET search_path TO 'public'
AS $$ select private.admin_adjust_user_tokens(_user_id, _amount, _reason); $$;
REVOKE ALL ON FUNCTION public.admin_adjust_user_tokens(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_tokens(uuid, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_token_summary(_hours integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare since timestamptz := now() - make_interval(hours => _hours); r jsonb;
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'consumed', coalesce((select -sum(amount) from token_transactions where type = 'tryon_usage' and created_at >= since), 0),
    'granted', coalesce((select sum(amount) from token_transactions where amount > 0 and created_at >= since), 0),
    'circulation', coalesce((select sum(balance) from user_credits), 0),
    'ai_tokens', coalesce((select sum(total_tokens) from monitoring_events where event_type = 'tryon_succeeded' and created_at >= since), 0),
    'ai_cost_usd', coalesce((select sum(cost_usd) from monitoring_events where event_type = 'tryon_succeeded' and created_at >= since), 0),
    'generations', (select count(*) from monitoring_events where event_type = 'tryon_succeeded' and created_at >= since),
    'by_model', coalesce((select jsonb_agg(x) from (
        select coalesce(model,'unknown') as model, coalesce(mode,'unknown') as mode, count(*) as runs,
               coalesce(sum(total_tokens),0) as tokens, coalesce(sum(cost_usd),0) as cost_usd
          from monitoring_events where event_type = 'tryon_succeeded' and created_at >= since
         group by 1,2 order by runs desc) x), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(u) from (
        select p.id as user_id, p.email, p.full_name, coalesce(c.balance,0) as balance,
               coalesce(c.total_granted,0) as total_granted, coalesce(c.total_consumed,0) as total_consumed
          from profiles p left join user_credits c on c.user_id = p.id
         order by coalesce(c.total_consumed,0) desc, p.created_at desc limit 500) u), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(t) from (
        select t.id, t.user_id, p.email, t.amount, t.type, t.reason, t.balance_after, t.created_at
          from token_transactions t left join profiles p on p.id = t.user_id
         order by t.created_at desc limit 100) t), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
REVOKE ALL ON FUNCTION private.admin_token_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_token_summary(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_token_summary(_hours integer DEFAULT 168)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ select private.admin_token_summary(_hours); $$;
REVOKE ALL ON FUNCTION public.admin_token_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_token_summary(integer) TO authenticated, service_role;